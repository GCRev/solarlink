import Evt from './evt'
import OrderedObjectList from './ordered_list'

function normalize (value, min, max) {
  return (value - min) / (max - min)
}

class GraphController extends Evt {
  constructor(args = {}) {
    super()

    Object.defineProperties(this, {
      eventLogDirty: {
        enumerable: false,
        writable: true, 
        value: false
      },
      memoizedChannelData: {
        enumerable: false,
        writable: true,
        value: {}
      }
    })

    this.eventLog  = new OrderedObjectList({ keyName: 'timestamp' })
    this.channels = new Map()
    this.groups = new Map()
    this.cursorPosition = [ 0, 0 ]
    this.inspecting = false
    this.memoizedChannelData = new Map()
  }

  _createChannel(params) {
    return {
      enabled: true,
      points: [],
      vMin: Number.MAX_SAFE_INTEGER,
      vMax: -Number.MAX_SAFE_INTEGER,
      ...params
    }
  }

  _createFusedChannel(xChannel, yChannel) {
    if (!xChannel || !yChannel) return

    /* take the name from the yChannel */
    return this._createChannel({ 
      name: yChannel.name,
      group: yChannel.group,
      enabled: yChannel.enabled,
      yMin: yChannel.vMin,
      yMax: yChannel.vMax,
      xMin: xChannel.vMin,
      xMax: xChannel.vMax,
      points: yChannel.points.map(( dataPoint, index ) => {
        return [ xChannel.points[index], dataPoint ]
      })
    })
  }

  _createGroupsFromFusedChannels(fusedChannels) {
    const resultGroups =  new Map() 

    fusedChannels = fusedChannels.filter(channel => { return channel && channel.enabled })

    for (const channel of fusedChannels) {
      let resultGroup = resultGroups.get(channel.group)
      if (!resultGroup) {
        resultGroup = {
          name: channel.group,
          xMin: Number.MAX_SAFE_INTEGER,
          xMax: -Number.MAX_SAFE_INTEGER,
          yMin: Number.MAX_SAFE_INTEGER,
          yMax: -Number.MAX_SAFE_INTEGER,
          channels: []
        }
        resultGroups.set(channel.group, resultGroup)
      }
      resultGroup.xMin = Math.min(channel.xMin, resultGroup.xMin)
      resultGroup.xMax = Math.max(channel.xMax, resultGroup.xMax)
      resultGroup.yMin = Math.min(channel.yMin, resultGroup.yMin)
      resultGroup.yMax = Math.max(channel.yMax, resultGroup.yMax)

    }

    /* 
     * copy the current mins and maxes back to the channel after calculation 
     * have iterate again because otherwise mins and maxes won't be right
     */ 
    for (const channel of fusedChannels) {
      const resultGroup = resultGroups.get(channel.group)
      const newChannel = this._createChannel(channel)
      newChannel.xMin = resultGroup.xMin 
      newChannel.xMax = resultGroup.xMax 
      newChannel.yMin = resultGroup.yMin 
      newChannel.yMax = resultGroup.yMax 
      newChannel.vMin = newChannel.yMin
      newChannel.vMax = newChannel.yMax

      resultGroup.channels.push(newChannel)
    }

    for (const group of resultGroups.values()) {
      if (!group.channels.length) {
        resultGroups.delete(group.name)
      }
    }

    return resultGroups
  }

  _memoizeChannelData(dataPoints = this.eventLog.all()) {
    for (const channel of this.channels.values()) {
      channel.points = []
    }

    for (const dataPoint of dataPoints) {
      for (const channelName in dataPoint) {
        /* time isn't a valid channel */
        const channel = this.channels.get(channelName)
        if (!channel) continue

        const value = dataPoint[channelName] 
        channel.points.push(value)
        channel.vMin = Math.min(channel.vMin, value)
        channel.vMax = Math.max(channel.vMax, value)
      }
    }

    const drawChannels = []
    const timestampChannel = this.channels.get('timestamp')
    /* 
     * filter AND copy the channel data to a new object
     * so that we can set global mins and maxes without
     * modifying the underlying channel data
     */
    for (const channel of this.channels.values()) {
      if (channel !== timestampChannel && channel.enabled) drawChannels.push(this._createFusedChannel(timestampChannel, channel))
    }
    /* create a map for global values per group  */
    const groupedGlobals = this._createGroupsFromFusedChannels(drawChannels)

    this.memoizedChannelData = groupedGlobals
    this.eventLogDirty = false
  }

  updateChannels(dataPoints = this.eventLog.all()) {
    if (this.eventLogDirty) {
      this._memoizeChannelData(dataPoints)
    }

    if (!this.eventLogDirty) {
      this.fire('group-data', { groups: Array.from(this.memoizedChannelData.values()) })
    }
  }

  addPoint(dataPoint) {
    /* do not auto-log points outside configured time range */
    const timestampChannel = this.channels.get('timestamp')
    if (dataPoint.timestamp < timestampChannel.vMin ||
      dataPoint.timestamp > timestampChannel.vMax) return 

    this.eventLog.add(dataPoint)
    this.eventLogDirty = true

    this.updateChannels()

    this.fire('log-append', dataPoint)
  }

  setPoints(points) {
    this.eventLog.clear()
    this.eventLog.add(...points)
    this.eventLogDirty = true

    this.updateChannels()

    this.fire('log-load', this.eventLog.all())
  }

  setConfig({ channels = [], groups = [] }) {
    this.groups.clear()
    this.channels.clear()

    for (const channelConfig of channels) {
      /* just overwrite directly to reset all info and fully-recalculate */
      const channel = this._createChannel(channelConfig)
      this.channels.set(channelConfig.name, channel)
      channel.enabled ? this.enableChannel(channel.name) : this.disableChannel(channel.name)
    }

    for (const group of groups) {
      this.groups.set(group.name, group)

      /* update the groupName of each channel */
      for (const channelIndex of group.channels) {
        const channel = this.channels.get(channels[channelIndex].name) 
        if (channel) {
          channel.group = group.name
        } 
      }
    }

    this.fire('set-config', { groups: this.groups, channels: this.channels })
  }

  getChannelData(channelName) {
    /* 
     * first check if the channel name matches anything in the first entry
     *
     * if it doesn't, then return an empty array because it's invalid
     */
    const eventItem = this.eventLog.first()
    if (!eventItem) return []

    if (!(channelName in eventItem)) return []

    return this.eventLog.all().map(eventItem => {
      return [ eventItem.timestamp, eventItem[channelName] ]
    })
  }

  queryCursorPosition(factor) {
    /* 
     * query all enabled (visible) channels and return 
     *
     * FACTORS (0.0 - 1.0) if normalized = true
     * Raw values if normalized = false
     * 
     * factors are inherently easier to apply to whatever output scale
     */
    if (!this.memoizedChannelData) {
      this._memoizeChannelData()
    }

    const output = new Map()

    const timestampChannel = this.channels.get('timestamp')
    const timestampGroup = {
      name: 'time',
      channels: [ timestampChannel ]
    }
    
    const groups = Array.from(this.memoizedChannelData.values())
    groups.push(timestampGroup)

    const pointAt = (channel, index) => {
      let point = channel.points[index]
      if (!Array.isArray(point)) {
        point = [ point, point ]
      }
      return point
    }

    for (const group of groups) {
      const outputGroup = { ...group, channels: [] }
      if (!group.channels) { continue }
      for (const channel of group.channels) {
        if (!channel) { continue }

        const outputChannel = { ...channel }
        delete outputChannel.points

        /* 
         * create an index lookup from the factor value 
         * limit to the length of the array so no invalid lookups are attempted
         */

        const xMin = channel.xMin ?? channel.vMin
        const xMax = channel.xMax ?? channel.vMax

        const unNormalize = factor * (xMax - xMin) + (xMin)

        /* index will either be an exact match or before the next index */
        const { index } = this.eventLog.get(unNormalize)
        const lastIndex = Math.max(0, index - 1)
        const nextIndex = Math.min(channel.points.length - 1, index)

        /* determine if current value is closer to last point or next point */ 
        const targetIndex = unNormalize - pointAt(channel, lastIndex)[0] < pointAt(channel, nextIndex)[0] - unNormalize ? lastIndex : nextIndex

        let point = pointAt(channel, targetIndex)
        const [ x, y ] = point 

        outputChannel.pointNormalized = [ normalize(x, xMin, xMax), normalize(y, channel.vMin, channel.vMax) ]
        outputChannel.point = point.slice()
        if (outputChannel.name === 'timestamp') {
          const date = new Date(x)
          outputChannel.pointFormatted = `${date.getFullYear()}-${((date.getMonth() + 1) + '').padStart(2, '0')}-${(date.getDate() + '').padStart(2, '0')}`
            + `, ${(date.getHours() + '').padStart(2, '0')}:${(date.getMinutes() + '').padStart(2, '0')}`
        }
        outputGroup.channels.push(outputChannel)
      }
      output.set(group.name, outputGroup)
    }

    return output
  }

  setCursorPosition(x, y = 0) {
    /* x and y are both factors */
    this.cursorPosition[0] = x
    this.cursorPosition[1] = y

    this.fire('set-cursor-position', { x, y })
  }

  inspect(x, y = 0) {
    this.inspecting = true
    this.setCursorPosition(x, y)
    this.fire('inspect', { x, y, inspecting: this.inspecting, inspectionData: this.queryCursorPosition(x) })
  }

  uninspect() {
    this.inspecting = false
    this.fire('inspect', { inspecting: this.inspecting })
  }

  enableChannel(channelName) {
    const channel = this.channels.get(channelName)
    if (!channel) return
    
    channel.enabled = true

    /* 
     * I am electing to manually re-memoize the channel config rather 
     * than setting the eventLog dirty flag
     */
    this._memoizeChannelData()
    this.updateChannels()
    this.fire('enable-channel', { enabled: true, channel })
    if (this.inspecting) {
      this.inspect(this.cursorPosition[0], this.cursorPosition[1])
    }
  }

  disableChannel(channelName) {
    const channel = this.channels.get(channelName)
    if (!channel) return
    
    channel.enabled = false
    this._memoizeChannelData()
    this.updateChannels()
    this.fire('enable-channel', { enabled: false, channel })
    if (this.inspecting) {
      this.inspect(this.cursorPosition[0], this.cursorPosition[1])
    }
  }

  toggleChannel(channelName) {
    const channel = this.channels.get(channelName)
    if (!channel) return
    
    if (channel.enabled) this.disableChannel(channelName)
    else this.enableChannel(channelName)
  }

  isChannelEnabled(channelName) {
    const channel = this.channels.get(channelName)
    if (!channel) return false
    
    return channel.enabled
  }

  getVisibleChannels(enabledOnly = false) {
    const result = []
    for (const channel of this.channels.values()) {
      if (channel.visible ?? true) {
        const channelCopy = { ...channel }
        delete channelCopy.points
        if (enabledOnly)  {
          if (channel.enabled) result.push(channelCopy)
        } else {
          result.push(channelCopy)
        }
      }
    }
    return result
  }

}

export default GraphController
