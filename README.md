# Solarlink

A webapp for visualizing the power routing / usage over time of a Tesla Powerwall

# Setup

## Hardware

* I recommend using an SBC (Single Board Computer). I have only tested this on Ubuntu, but I imagine
  any linux distro would work.
* Clone the repo onto the SBC like a Raspberry Pi with both an ethernet and
  wifi interface.
* Connect the SBC directly to the Powerwall's ethernet port. The Powerwall prioritizes ethernet
  connections over wifi and cellular.

## Software

* Configure the Powerwall to have a static IP in the Powerwall's network settings. I have mine
  configured to `192.168.89.10` through the `192.168.89.1` gateway
* Install nodejs (latest version) + npm on the SBC
* run `npm install -g pm2@latest` to install Process Manager 2, which runs the server as a service
* The rules.v4 file contains the iptables configuration required to forward traffic from the
  Powerwall to the server, as well as masquerade for the Powerwall to connect to the outside
  internet. Use `iptables-restore < rules.v4` to copy the rules to the iptables rules file. Use
  `iptables save` to ensure the rules persist across restarts.
* The 50-cloud-init.yaml file contains the netplan configuration I use for my own server. The server
  connects to your wifi network to allow you to access it on your devices on the same network.
  Configure this file however you like to suit your needs.
* run `pm2 start ecosystem.config.js` to daemonize the server process -- _note that pm2@latest must
  be installed for ES6 module support_

## Notes

This program caches your login credentials for re-use, and does so **in the clear.**  Since your
server should be locked down anyway, this should not be a terrible issue. The Powerwall credentials
are also local-only, and do not reflect any real-life passwords or usernames. 

The config.json and log files can be found at the following directories for the following
architectures:

* macOS: ~/Library/Application Support/SolarLink
* Windows: %LOCALAPPDATA%\SolarLink\Data (for example, C:\Users\USERNAME\AppData\Local\SolarLink\Data)
* Linux: ~/.local/share/SolarLink (or $XDG_DATA_HOME/SolarLink)

