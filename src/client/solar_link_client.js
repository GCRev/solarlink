import Evt from './evt'
import GraphController from './graph_controller'

class SolarLinkClient extends Evt {
  constructor (args = {}) {
    super()
    const data = {
      date: new Date()
    }
    const proxyHandler = {
      /*
       * budget redux
       *
       * but it's not redux so literally no one will care
       */
      set: (obj, prop, value) => {
        if (typeof value === 'object') {
          obj[prop] = value
          this.fire(`set-${prop}`, value)
        } else {
          const oldval = obj[prop]
          obj[prop] = value
          if (oldval !== value) {
            this.fire(`set-${prop}`, value)
          }
        }
        return true
      }
    }

    this.data = new Proxy(data, proxyHandler)
    this.graphController = new GraphController()
  }

  _interpolateData(dataObject) {
    const {
      percentage: lastPercentage,
      solar: lastSolar,
      battery: lastBattery,
      site: lastGrid,
      load: lastLoad
    } = this.data.lastAggregates

    /* do interpolation here */
    const timeLimit = this.dataTs - this.lastDataTs
    const startTs = this.dataTs
    // console.log(timeLimit)
    const interp = (start = 0, end = 0, fac) => {
      return end + (start - end) * (fac > 1 ? 0 : 1 - fac)
    }

    const animate = (ts) => {
      const diff = ts - startTs 
      const fac = diff / timeLimit
      this.fire('data-interpolated', {
        percentage: interp(lastPercentage, dataObject.percentage, fac),
        solar: interp(lastSolar, dataObject.solar, fac),
        site: interp(lastGrid, dataObject.site, fac),
        battery: interp(lastBattery, dataObject.battery, fac),
        load: interp(lastLoad, dataObject.load, fac),
        fac,
        diff 
      })
      if (fac < 1) {
        requestAnimationFrame(animate)
      }
    }

    animate(this.dataTs)
  }

  isWsConnected() {
    if (!this.webSocket) return false
    return this.webSocket.readyState === WebSocket.OPEN
  }

  connect(retryOnly) {
    if (this.isWsConnected() && retryOnly) {
      return 
    }

    return new Promise((resolve, reject) => {
      if (this.webSocket) {
        this.webSocket.close()
      }

      this.webSocket = new WebSocket(`ws://${location.host}`)
      this.webSocket.addEventListener('error', () => {
        const message = 'Real-time connection to serverino encountered an error'
        this.notify({
          title: 'Connection Error',
          content: message,
          className: 'warn'
        })
        reject(Error(message))
      })
      this.webSocket.addEventListener('message', async evt => {
        if (evt.data === 'connected') {
          if (this.isWsConnected()) {
            resolve()
          }
        } else if (typeof evt.data === 'string') {
          const prefix = evt.data.split(':')[0]
          const data = evt.data.slice(prefix.length + 1)
          switch (prefix) {
          case 'dat':
            /* 
             * when the websocket receives a data command from the server
             *
             * this will update all graphs and readouts and whatnot
             */
            try {
              const dataObject = JSON.parse(data)
              this.fire('data', dataObject)
              this.lastDataTs = this.dataTs ?? 0
              this.dataTs = performance.now()
              this.data.lastAggregates = this.data.aggregates || {}
              this.data.aggregates = dataObject
              this._interpolateData(dataObject)
            } catch (err) {
              /* do nothing */
            }
            break
          case 'log':
            try {
              const date = new Date()
              /* this means it is a new day */
              if (date.getDate() !== this.data.date.getDate()) {
                await this.loadLog()
                this.data.date = date
              }
              const dataObject = JSON.parse(data)
              this.graphController.addPoint(dataObject)
            } catch (err) {
              /* do nothing */
            }
            break
          }
        }
      })
    })

  }

  getChannelData(channelName) {
    return this.graphController.getChannelData(channelName)
  }

  showGraph() {
    this.data.showingGraph = true
    this.fire('show-graph', true)
  }

  hideGraph() {
    this.data.showingGraph = false
    this.fire('hide-graph', true)
  }

  toggleGraph () {
    if (this.data.showingGraph) this.hideGraph()
    else this.showGraph()
  }

  async loadLog(dateString) {
    try {
      const params = new URLSearchParams()
      if (dateString) params.append('date', dateString)
      const [ logResponse, channelConfigResponse ] = await Promise.all([ 
        fetch(`log?${params.toString()}`, {
          method: 'GET'
        }),
        fetch(`channelconfig?${params.toString()}`, {
          method: 'GET'
        })
      ])
      const [ responseJson, channelConfig ] = await Promise.all([ 
        logResponse.json(),
        channelConfigResponse.json() 
      ])
      this.graphController.eventLog.clear()
      this.graphController.setConfig(channelConfig)
      this.graphController.setPoints(responseJson)
    } catch (err) {
      console.log(err)
    }
  }

  async logon(email, password) {
    try {
      const response = await fetch('auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      })
      const responseJson = await response.json()
      this.fire('logon', responseJson)
      this.connect()
      this.loadLog()
    } catch (err) {
      /* do nothing */
    }
  }
}

export default SolarLinkClient
