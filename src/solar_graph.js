import './solar_graph.css'
import PropTypes from 'prop-types'
import { useRef, useState, useEffect } from 'react'
import Paper from '@material-ui/core/Paper'
import Toolbar from '@material-ui/core/Toolbar'
import Button from '@material-ui/core/Button'
import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import Box from '@material-ui/core/Box'
import { CSSTransition } from 'react-transition-group'
import { Canvas2dGraph } from './graph'

function SolarGraphInspector(props) {
  
  const ref = useRef()

  const [ info, setInfo ] = useState([])

  useEffect(() => {

    const onInspect = ({ inspecting, inspectionData }) => {
      if (!inspecting || !inspectionData) return

      const newInfo = []
      for (const group of inspectionData.values()) {
        newInfo.push({ 
          name: group.name,
          channels: group.channels.map(channel => {
            return {
              name: channel.name,
              value: channel.pointFormatted ?? (channel?.point?.[1] || 0).toFixed(2)
            }
          }) 
        })
      }
      setInfo(newInfo)
    }

    props.controller.on('inspect', onInspect)

    return () => {
      props.controller.un('inspect', onInspect)
    }
  }, [])

  const infoToChildren = info => {
    return (
      <>
        { 
          info.map(group => {
            return (
              <div className="group" key={ group.name }>
                { group.name }
                <hr/>
                <table>
                  <tbody>
                    { 
                      group.channels.map(channel => {
                        return (
                          <tr key={ channel.name }>
                            <td className="label">{ channel.name }:</td>
                            <td className="value">{ channel.value }</td>
                          </tr>
                        )
                      })
                    }
                  </tbody>
                </table>
              </div>
            )
          })
        }
      </>
    )
  }

  return (
    <CSSTransition
      in = { props.in }
      unmountOnExit
      timeout = { 300 }
      nodeRef = { ref }
      classNames = "inspector"
    >
      <Card className={ `inspector ${props.right ? 'right' : ''}` } ref={ ref }>
        <CardContent>
          { infoToChildren(info) }        
        </CardContent>
      </Card>
    </CSSTransition>
  )
}

SolarGraphInspector.propTypes = {
  controller: PropTypes.object.isRequired,
  in: PropTypes.bool.isRequired,
  right: PropTypes.bool
}

function SolarGraph(props) {

  const ref = useRef()

  const [ inspecting, setInspecting ] = useState(false)

  /* keep these separate so react doesn't re-render children */
  const [ channelInfo, setChannelInfo ] = useState([])
  const [ enabledChannels, setEnabledChannels ] = useState([])
  const [ right, setRight ] = useState(false)

  useEffect(() => {

    const onInspect = ({ inspecting }) => {
      setInspecting(inspecting)
    }

    const onSetConfig = () => {
      setChannelInfo(props.solarLinkClient.graphController.getVisibleChannels())
    }

    const onEnableChannel = () => {
      setEnabledChannels(props.solarLinkClient.graphController.getVisibleChannels().map(channel => channel.enabled))
    }

    const onCursorPosition = ({ x }) => {
      setRight(x < 0.5)
    }

    props.solarLinkClient.graphController.on('inspect', onInspect)
    props.solarLinkClient.graphController.on('uninspect', onInspect)
    props.solarLinkClient.graphController.on('enable-channel', onEnableChannel)
    props.solarLinkClient.graphController.on('set-config', onSetConfig)
    props.solarLinkClient.graphController.on('set-cursor-position', onCursorPosition)

    return () => {
      props.solarLinkClient.graphController.un('inspect', onInspect)
      props.solarLinkClient.graphController.un('uninspect', onInspect)
      props.solarLinkClient.graphController.un('enable-channel', onEnableChannel)
      props.solarLinkClient.graphController.un('set-config', onSetConfig)
      props.solarLinkClient.graphController.un('set-cursor-position', onCursorPosition)
    }
  }, [])

  return (
    <CSSTransition
      in={ props.in }
      unmountOnExit
      timeout={ 800 }
      nodeRef={ ref }
      classNames="solar-graph"
    >
      <Paper className="solar-graph" elevation={ 8 } ref={ ref }>
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <Canvas2dGraph controller={ props.solarLinkClient.graphController } />
        </Box>
        <SolarGraphInspector in={ inspecting } right={ right } controller={ props.solarLinkClient.graphController } />
        <Toolbar className="stretch-toolbar">
          {
            channelInfo.map((channel, index) => {
              return (
                <Button 
                  className={ `channel-button ${channel.name} ${enabledChannels[index] ? 'enabled' : ''}` } 
                  key={ channel.name }
                  onClick={ () => { props.solarLinkClient.graphController.toggleChannel(channel.name) }}
                >
                  { channel.name }
                </Button>
              )
            })
          }
        </Toolbar>
      </Paper>
    </CSSTransition>
  )
}

SolarGraph.propTypes = {
  solarLinkClient: PropTypes.object.isRequired,
  in: PropTypes.bool.isRequired
}

export {
  SolarGraph
}
