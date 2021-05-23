import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import App from './app'
import SolarLinkClient from './client/solar_link_client'

const solarLinkClient = new SolarLinkClient()
window.solarLinkClient = solarLinkClient

/* 
 * attempt to log on immediately
 * server will use stored credentials if they exist
 */
solarLinkClient.logon()

ReactDOM.render(
  <React.StrictMode>
    <App solarLinkClient={ solarLinkClient }/>
  </React.StrictMode>,
  document.getElementById('root')
)
