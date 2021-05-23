// import fragSource from './graph.frag'
// import vertSource from './graph.vert'
import { useRef, useState, useEffect } from 'react' 
import PropTypes from 'prop-types'

function resize(canvas, width, height) {
}

const channelPlaceholders = new Map()

function getChannelStyle({ name: channelName }) {
  let el = channelPlaceholders.get(channelName)
  if (!el) {
    el = document.createElement('div')
    el.className = `graph-channel ${channelName}`
    channelPlaceholders.set(channelName, el)
    document.body.appendChild(el)
  }
  return getComputedStyle(el)
}

function mapValue(fromMin, fromMax, toMin, toMax, value, invert = false) {
  if (!invert) return (toMax - toMin) * ((value - fromMin) / (fromMax - fromMin))
  else return (toMax - toMin) * (1 - ((value - fromMin) / (fromMax - fromMin)))
}

function clearCanvas2d(canvas) {
  canvas.clearRect(0, 0, canvas.width, canvas.height)
}

function drawCanvas2dChannelData(canvas, channel) {
  const { xMin, xMax, yMin, yMax } = channel
  const points = channel.points
  const channelStyle = getChannelStyle(channel) 
  const primaryColor = channelStyle.getPropertyValue('--col')
  canvas.fillStyle = `rgba(${primaryColor}, 0.35)`
  canvas.strokeStyle = `rgb(${primaryColor})`
  canvas.lineWidth = 2

  const drawData = () => {
    const zero = mapValue(yMin, yMax, 0, canvas.height, 0, true)
    canvas.beginPath()
    for (let a = 1; a < points.length; a++) {
      const [ tsNow, valueNow ] = points[a]
      const [ tsLast, valueLast ] = points[a - 1]
      canvas.moveTo(mapValue(xMin, xMax, 0, canvas.width, tsLast), zero)
      canvas.lineTo(mapValue(xMin, xMax, 0, canvas.width, tsNow), zero)
      canvas.lineTo(mapValue(xMin, xMax, 0, canvas.width, tsNow), mapValue(yMin, yMax, 0, canvas.height, valueNow, true))
      canvas.lineTo(mapValue(xMin, xMax, 0, canvas.width, tsLast), mapValue(yMin, yMax, 0, canvas.height, valueLast, true))
      canvas.closePath()
    }

    canvas.fill()

    canvas.beginPath()
    if (points.length) canvas.moveTo(mapValue(xMin, xMax, 0, canvas.width, points[0]), mapValue(yMin, yMax, 0, canvas.height, points[1], true))
    for (let a = 0; a < points.length; a++) {
      const [ tsNow, valueNow ] = points[a]
      canvas.lineTo(mapValue(xMin, xMax, 0, canvas.width, tsNow), mapValue(yMin, yMax, 0, canvas.height, valueNow, true))
    }

    canvas.stroke()
  }

  drawData()
}

function drawCanvas2dCursor(canvas, factor) {
  canvas.strokeStyle = 'rgb(128,128,128)'
  canvas.lineWidth = 2
  const x = mapValue(0, 1, 0, canvas.width, factor)
  canvas.beginPath()
  canvas.moveTo(x, 0)
  canvas.lineTo(x, canvas.height)
  canvas.stroke()
}

function drawCanvas2dPointHighlights(canvas, channel) {
  const channelStyle = getChannelStyle(channel) 
  const primaryColor = channelStyle.getPropertyValue('--col')
  canvas.fillStyle = `rgba(${primaryColor}, 0.35)`
  canvas.strokeStyle = `rgb(${primaryColor})`
  canvas.lineWidth = 2

  canvas.beginPath()
  const x = mapValue(0, 1, 0, canvas.width, channel.pointNormalized[0])
  const y = mapValue(0, 1, 0, canvas.height, channel.pointNormalized[1], true)
  canvas.ellipse(x, y, 4, 4, 0, 0, 2 * Math.PI)
  canvas.fill()
  canvas.stroke()
}

function clearGl(canvas) {
}

function drawGlChannelData(canvas, channel, dataArray) {
}

function drawGlCursor(canvas, factor, channel) {
}

function drawGlPointHighlights(canvas, channel) {
}

function generateGraphComponent(context) {
  const result = props => {

    const ref = useRef()
    const cursorRef = useRef()

    useEffect(() => {

      const canvas = ref.current.getContext(context)
      const cursorCanvas = cursorRef.current.getContext(context)

      const nop = () => {}
      let clear = nop
      let drawChannelDataFunction = nop
      let drawCursorFunction = nop
      let drawPointHighlightsFunction = nop

      switch (context) {
      case '2d':
        clear = clearCanvas2d
        drawChannelDataFunction = drawCanvas2dChannelData
        drawCursorFunction = drawCanvas2dCursor
        drawPointHighlightsFunction = drawCanvas2dPointHighlights
        break
      case 'webgl2':
        clear = clearGl
        drawChannelDataFunction = drawGlChannelData
        drawCursorFunction = drawGlCursor
        drawPointHighlightsFunction = drawGlPointHighlights
        break
      }

      const drawChannelData = ({ groups }) => {
        clear(canvas)
        for (const group of groups) {
          for (const channel of group.channels) {
            drawChannelDataFunction(canvas, channel)
          }
        }
      }

      const onResize = () => {
        const resize = (el, canvas) => {
          const width = el.offsetWidth
          const height = el.offsetHeight
          el.setAttribute('width', width)
          el.setAttribute('height', height)
          canvas.width = width
          canvas.height = height
        }
        resize(ref.current, canvas)
        resize(cursorRef.current, cursorCanvas)
        props.controller.updateChannels()
      }

      const drawCursor = ({ x, inspectionData }) => {

        clear(cursorCanvas)

        /* then draw the cursor */
        drawCursorFunction(cursorCanvas, x)

        /* then highlight the selected points */
        for (const group of inspectionData.values()) {
          for (const channel of group.channels) {
            if (channel.visible ?? true) {
              drawPointHighlightsFunction(cursorCanvas, channel)
            }
          }
        }
      }

      const inspect = params => {
        if (params.inspecting) {
          drawCursor(params)
        } else {
          clear(cursorCanvas)
        }
      }

      const mouseMove = evt => {
        props.controller.inspect(evt.layerX / canvas.width, evt.layerY / canvas.height)
      }

      const mouseLeave = () => {
        props.controller.uninspect()
      }

      props.controller.on('group-data', drawChannelData)
      props.controller.on('inspect', inspect)
      window.addEventListener('resize', onResize)
      ref.current.addEventListener('mousemove', mouseMove)
      ref.current.addEventListener('mouseleave', mouseLeave)

      onResize()

      return () => {
        props.controller.un('group-data', drawChannelData)
        props.controller.un('inspect', inspect)
        window.removeEventListener('resize', onResize)
      }

    }, [])

    return (
      <div className="frame-full">
        <canvas className="graph frame-full" ref={ ref }/>
        <canvas className="cursor frame-absolute" ref={ cursorRef } style = {{ height: '100%', width: '100%', pointerEvents: 'none' }}/>
      </div>
    )
  }

  result.propTypes = {
    controller: PropTypes.object.isRequired
  }

  return result
}

const OpenGlGraph = generateGraphComponent('webgl2')
const Canvas2dGraph = generateGraphComponent('2d')

export {
  OpenGlGraph,
  Canvas2dGraph
}
