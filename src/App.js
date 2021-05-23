import { useState, useEffect } from 'react'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
// import Button from '@material-ui/core/Button'
import DialogContent from '@material-ui/core/DialogContent'
import DialogContentText from '@material-ui/core/DialogContentText'
import DialogTitle from '@material-ui/core/DialogTitle'
import { makeStyles } from '@material-ui/core/styles'
import { TextField, Button } from './components'
import PropTypes from 'prop-types'
import { SolarGrid } from './solar_grid'

const useStyles = makeStyles({
  root: {
    '& .MuiDialog-container > .MuiDialog-paper': {
      padding: '10px'
    },
    '& sl-text-field > input': {
      fontSize: '1.1rem'
    },
    '& div.sl-error': {
      color: 'var(--red)'
    }
  }
})

function LoginDialog (props) {

  const [ email, setEmail ] = useState('')
  const [ password, setPassword ] = useState('')
  const classes = useStyles()

  const onChange = fn => {
    return evt => {
      fn(evt.target.value)
    }
  }

  const submit = () => {
    props.onSubmit?.(email, password)
  }

  return (
    <Dialog className={ classes.root } open={ props.open } aria-labelledby="form-dialog-title">
      <DialogTitle id="form-dialog-title">Log on</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Enter credentials for Powerwall Gateway
        </DialogContentText>
      </DialogContent>
      <TextField 
        label="e-mail"
        type ="email"
        onChange = { onChange(setEmail) }
      />
      <TextField 
        label="password"
        type ="password"
        onChange = { onChange(setPassword) }
      />
      { props.errors?.length &&
        props.errors?.map((error, index) => {
          return (
            <div className="sl-error" key={`error-${index}`}>{error}</div>
          )
        })
      }
      <DialogActions>
        <Button 
          onClick={ submit } 
          color="primary"
          variant="contained"
        >
          Submit 
        </Button>
      </DialogActions>
    </Dialog>
  )
}

LoginDialog.propTypes = {
  onSubmit: PropTypes.func,
  open: PropTypes.bool,
  errors: PropTypes.array
}

function App(props) {

  const [ loggedOn, setLoggedOn ] = useState(false)
  const [ logonErrors, setLogonErrors ] = useState([])

  const onSubmit = props.solarLinkClient.logon.bind(props.solarLinkClient)

  useEffect(() => {

    const onLogon = responseJson => {
      setLoggedOn(responseJson.success) 
      setLogonErrors(responseJson.errors)
    }

    props.solarLinkClient.on('logon', onLogon)

    /* cleanup */
    return () => {
      props.solarLinkClient.un('logon', onLogon)
    }
  })

  return (
    <div className="app frame-full">
      <LoginDialog open={ !loggedOn } errors={ logonErrors } onSubmit={ onSubmit } /> 
      { loggedOn && <SolarGrid solarLinkClient={props.solarLinkClient}/> } 
    </div>
  )
}

App.propTypes = {
  solarLinkClient: PropTypes.object.isRequired
}

export default App
