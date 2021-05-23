import './components.css'
import PropTypes from 'prop-types'
import Button from '@material-ui/core/Button'

function TextField (props) {
  return (
    <sl-text-field>
      { props.label &&
      <sl-label>
        { props.label }
      </sl-label>
      }
      <input
        { ...{
          ...props.type && { type: props.type },
          ...props.onChange && { onChange: props.onChange }
        }}
      >
      </input>
    </sl-text-field>
  )
}

TextField.propTypes = {
  label: PropTypes.string,
  type: PropTypes.string,
  onChange: PropTypes.func
}

function ThemedButton(props) {
  return <Button className="sl-button" {...props} />
}

function Icon(props) {
  return (
    <svg
      className={`icon ${props.className || ''}`}
      viewBox={props.iconSize && `0 0 ${props.iconSize} ${props.iconSize}`}
    >
      <use
        href={props.url}
      ></use>
    </svg>
  )
}

Icon.propTypes = {
  className: PropTypes.string.isRequired,
  iconSize: PropTypes.number,
  url: PropTypes.string
}

export {
  TextField,
  ThemedButton as Button,
  Icon
}
