import './solar_grid.css'
import PropTypes from 'prop-types'
import { useRef, useState, useEffect } from 'react'
import { Icon } from './components'
import { SolarGraph } from './solar_graph.js'

function Monitor(props) {
  return (
    <div className={ `monitor ${props.monitorType}` } onClick={ props.onClick }>
      <Icon className={ props.monitorType } url={`#${props.monitorType}-icon`}/>
      <div className="data-label">{props.value?.toFixed(0)}</div> 
    </div>
  )
}

Monitor.propTypes = {
  monitorType: PropTypes.oneOf([ 'solar', 'battery', 'load', 'site' ]),
  value: PropTypes.number,
  onClick: PropTypes.func
}

function Route(props) {

  const [ path, setPath ] = useState('')
  const [ stroke, setStroke ] = useState('')
  const [ viewBox, setViewBox ] = useState('0 0 1 1')

  const ref = useRef()

  useEffect(()=> {

    const onResize = () => {
      const r = ref.current.offsetWidth
      const b = ref.current.offsetHeight
      const rad = 64
      setViewBox(`-2 -2 ${r + 4} ${b + 4}`)
      switch (props.type) {
      case 'site-solar':
        setStroke('url("#solar-site-grad")')
        setPath(`M${r} 0V${b - rad}a${rad} ${rad} 0 0 1 ${-rad} ${rad}H0`)
        break
      case 'solar-load':
        setStroke('url("#solar-load-grad")')
        setPath(`M0 0V${b - rad}a${rad} ${rad} 0 0 0 ${rad} ${rad}H${r}`)
        break
      case 'battery-load':
        setStroke('url("#battery-load-grad")')
        setPath(`M0 ${b}V${rad}a${rad} ${rad} 0 0 1 ${rad} ${-rad}H${r}`)
        break
      case 'site-load':
        setStroke('url("#site-load-grad")')
        setPath(`M0 ${b / 2}L${r} ${b / 2 + 0.1}`)
        break
      case 'solar-battery':
        setStroke('url("#solar-battery-grad")')
        setPath(`M${r / 2} 0L${r / 2 + 0.1} ${b}`)
        break
      }
    }

    window.addEventListener('resize', onResize)

    onResize()

    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div
      ref={ ref }
      className={ `power-route ${props.type} ${props.visible ? '' : 'hidden'}` }
    >
      <svg viewBox={ viewBox }>
        <path d={ path } style={{ stroke }}/>
      </svg>
    </div>
  )
}

Route.propTypes = {
  type: PropTypes.string.isRequired,
  visible: PropTypes.bool
}

function SolarGrid(props) {

  const [ percentage, setPercentage ] = useState(0)
  const [ values, setValues ] = useState({})
  const [ routesVisible, setRoutesVisible ] = useState({})
  const [ showGraph, setShowGraph ] = useState(false)

  const onMonitorClick = () => {
    props.solarLinkClient.toggleGraph()
  }

  useEffect(() => {
    
    const processData = dataObject => {
      setPercentage(dataObject.percentage)
      
      const {
        solarToSite = false,
        siteToLoad = false,
        solarToLoad = false,
        batteryToLoad = false,
        solarToBattery = false
      } = dataObject.routes

      setRoutesVisible({
        solarToSite,
        siteToLoad,
        solarToLoad,
        batteryToLoad,
        solarToBattery
      })
    }

    const processInterpData = dataObject => {
      setValues({
        solar: dataObject.solar,
        site: dataObject.site,
        battery: dataObject.battery,
        load: dataObject.load
      })
    }

    props.solarLinkClient.on('data', processData)
    props.solarLinkClient.on('data-interpolated', processInterpData)
    props.solarLinkClient.on('set-showingGraph', setShowGraph)
    
    return () => {
      props.solarLinkClient.un('data', processData)
      props.solarLinkClient.un('data-interpolated', processInterpData)
      props.solarLinkClient.un('set-showingGraph', setShowGraph)
    }
  }, [])

  return (
    <div className={ `solar-grid ${showGraph ? 'show-graph' : ''}`}>
      <div className="percent-bar" style={{ height: `${percentage}%` }}/>
      <div className="monitors">
        <Monitor monitorType="solar" value={ values.solar } onClick={ onMonitorClick }/>
        <Monitor monitorType="battery" value={ values.battery } onClick= { onMonitorClick }/>
        <Monitor monitorType="load" value={ values.load } onClick={ onMonitorClick }/>
        <Monitor monitorType="site" value={ values.site } onClick={ onMonitorClick }/>
      </div>
      <Route type="site-solar" visible={ routesVisible.solarToSite } />
      <Route type="solar-load" visible={ routesVisible.solarToLoad } />
      <Route type="battery-load" visible={ routesVisible.batteryToLoad } />
      <Route type="site-load" visible={ routesVisible.siteToLoad } />
      <Route type="solar-battery" visible = { routesVisible.solarToBattery } />
      <SolarGraph solarLinkClient={ props.solarLinkClient } in={ showGraph }/>
    </div>
  )
}

SolarGrid.propTypes = {
  solarLinkClient: PropTypes.object.isRequired
}

export {
  SolarGrid 
}
