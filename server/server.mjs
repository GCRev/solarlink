import Express from 'express'
import bodyParser from 'body-parser'
import WS from 'express-ws'
import EnvPathSetup from 'env-paths'
import path from 'path'
import fs, { promises as fsp } from 'fs'
import https from 'https'
import { pack, unpack, length as getPackLength } from 'bitpack'
import { Transform } from 'stream'

const PORT = 54047

const envPaths = EnvPathSetup('SolarLink', { suffix: '' })

/* new express app */
const app = Express()
app.use(Express.static('public'))

/* remember to use the json body-parser */
app.use(bodyParser.json())

/* Initialate the wss */
const wss = WS(app).getWss()
const configBasePath = path.resolve(envPaths.data)
const configFilePath = path.resolve(configBasePath, 'config.json')
const logBasePath = path.resolve(configBasePath, 'logs')

const POWERWALL_URL = 'https://192.168.0.214:7600'
// const POWERWALL_URL = 'https://httpbin.org'

// process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0
// process.env['NODE_EXTRA_CA_CERTS'] = new URL('./powerwall.pem', import.meta.url)

/* wattage tolerance to determine whether a power route should be considered on */
const POWER_ROUTE_EPSILON = 50

const _loadedConfig = {}
const configProxy = {
  set(ob, key, value) {
    if (value !== ob[key]) {
      configDirty = true
    }

    /* MDN used Reflect.set here so I guess I will */
    return Reflect.set(...arguments)
  }
}
let loadedConfig = new Proxy(_loadedConfig, configProxy)

let configDirty = false

let loopId = -1

app.ws('/', ws => {
  ws.send('connected')
})

/* 
 * format all numbers before sending to conserve data usage
 *
 * truncate to 2 decimal places by rounding
 * values must be json numbers, not strings
 */

function calculateRoutes(powerData) {
  const {
    site = 0,
    battery = 0,
    load = 0,
    solar = 0
  } = powerData

  const EPS = POWER_ROUTE_EPSILON

  /* 
   * logic for showing connections
   *   positive means exporting (except load)
   *   negative means importing (except load)
   *
   *   battery ONLY EXPORTS to load
   *   battery ONLY IMPORTS from solar
   *   site ONLY EXPORTS to load
   *   site ONLY IMPORTS from solar
   *   solar EXPORTS to site, load, and battery
   *   solar = site + load + battery
   *   solar DOES NOT IMPORT
   *   load DOES NOT export
   *   load IMPORTS from site, batter, and solar
   *   
   *   glad I commented this logic in the previous version
   */

  return {
    solarToSite: site < -EPS,
    siteToLoad: site > EPS,
    solarToLoad: (load - solar - battery) < (site + EPS) && solar > EPS,
    batteryToLoad: battery > EPS,
    solarToBattery: battery < -EPS
  }
}

function getAuthCookieHeaders() {
  const { token, userRecord } = loadedConfig 

  if (!token || !userRecord) {
    return {}
  }

  return {
    Cookie: `AuthCookie=${token}; UserRecord=${userRecord}`
  }
}

function getAggregateData() {

  const request = https.get(`${POWERWALL_URL}/api/meters/aggregates`, {
    headers: {
      "User-Agent": "SolarLink",
      ...getAuthCookieHeaders()
    },
    rejectUnauthorized: false
  })

  return new Promise(resolve => {
    request.on('response', response => {
      let buffer = ''

      response.on('data', chunk => {
        buffer += chunk.toString('utf8')
      })

      response.on('end', () => {
        try {
          const rjson = JSON.parse(buffer)

          const { code, error } = rjson
          if (code >= 400 && error) {
            resolve(rjson)
            return
          }

          const f = num => {
            return Math.round(num * 100) / 100
          }
          const responseJson = {
            site: f(rjson.site.instant_power),
            battery: f(rjson.battery.instant_power),
            load: f(rjson.load.instant_power),
            solar: f(rjson.solar.instant_power)
          }
          responseJson.routes = calculateRoutes(responseJson)
          resolve(responseJson)
        } catch (err) {
          resolve()
        }
      })
    })
  })
}

function getBatteryPercentage() {

  const request = https.get(`${POWERWALL_URL}/api/system_status/soe`, {
    headers: {
      "User-Agent": "SolarLink",
      ...getAuthCookieHeaders()
    },
    rejectUnauthorized: false
  })

  return new Promise(resolve => {
    request.on('response', response => {
      let buffer = ''

      response.on('data', chunk => {
        buffer += chunk.toString('utf8')
      })

      response.on('end', () => {
        try {
          const rjson = JSON.parse(buffer)

          const { code, error } = rjson
          if (code >= 400 && error) {
            resolve(rjson)
            return
          }

          resolve(rjson)
        } catch (err) {
          resolve()
        }
      })
    })
  })
}

function powerwallAuth(email = loadedConfig.email, password = loadedConfig.password) {

  const outputString = Buffer.from(JSON.stringify({
    password,
    email,
    username: "customer",
    force_sm_off: false
  }), 'utf-8')

  const request = https.request(`${POWERWALL_URL}/api/login/Basic`, {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "SolarLink"
    },
    method: 'POST',
    rejectUnauthorized: false
  })


  return new Promise(resolve => {
    request.on('response', response => {
      let buffer = ''

      response.on('data', chunk => {
        buffer += chunk.toString('utf8')
      })

      response.on('end', () => {
        const cookies = (response.headers['set-cookie'] || [])
        for (const cookie of cookies) {
          const [ cookieValue ] = cookie.split(';').map(item => item.trim())
          const [ name, ...value ] = cookieValue.split('=')
          switch (name) {
          case 'AuthCookie':
            loadedConfig.token = value.join('=')
            break
          case 'UserRecord':
            loadedConfig.userRecord = value.join('=')
            break
          }
        }

        try {
          resolve(JSON.parse(buffer))
        } catch (err) {
          resolve()
        }
      })
    })

    request.write(outputString)
    request.end()
  })
}

async function readLocalData() {

  try {
    await fsp.access(configFilePath)
  } catch (err) {
    await fsp.mkdir(configBasePath, {recursive: true})
    await fsp.writeFile(configFilePath, '{}')
  }

  try {
    Object.assign(loadedConfig, JSON.parse(await fsp.readFile(configFilePath)))
    configDirty = true
    return loadedConfig
  } catch (err) {
    return {}
  }
}

async function writeLocalData() {

  try {
    await fsp.access(configFilePath)
    await fsp.writeFile(configFilePath, JSON.stringify(loadedConfig))
    configDirty = false
    return loadedConfig
  } catch (err) {
    return {}
  }
}

function getMsFromNow(secondsDivision = 10) {

  /* 
   * calculate the timeout so that it's to next 10 seconds __absolute__ rather
   * than relative
   */
  const date = new Date
  const now = date.valueOf()

  date.setSeconds(date.getSeconds() - (date.getSeconds() % secondsDivision) + secondsDivision)
  date.setMilliseconds(0)

  return date.valueOf() - now
}

async function configWriteLoop() {
  if (configDirty) {
    await writeLocalData()
  }
  setTimeout(configWriteLoop, getMsFromNow()) 
}

/* this is on a separate loop from the main loop, because it doesn't depend on resets */
configWriteLoop()

function messageClients (prefix, data) {
  for (const client of wss.clients) {
    client.send(`${prefix}:${data}`)
  }
}

function dateStringIsValid(dateString) {
  if (!dateString) return false
  return /^\d{4}_\d[1-9]_\d[1-9]$/.test(dateString)
}

async function getLogFile(dateString) {
  const date = new Date()
  const month = date.getMonth() + 1
  let logFileName = `${date.getFullYear()}_${month.toString().padStart(2, '0')}_${date.getDate().toString().padStart(2, '0')}.log`
  if (dateStringIsValid(dateString)) {
    logFileName = `${dateString}.log`
  }
  const fullPath = path.resolve(logBasePath, logFileName)
  try {
    await fsp.access(fullPath)
  } catch (err) {
    await fsp.mkdir(logBasePath, {recursive: true})
  }
  return fullPath
}

async function purgeLogFile() {
  const logFilePath = await getLogFile()
  const writeStream = fs.createWriteStream(logFilePath)
  writeStream.write('')
  writeStream.end()
  
  return new Promise(resolve => {
    writeStream.on('finish', () => { resolve() })
  })
}

async function writeToLogFile(data) {
  /* log structure, bit-packed
   *
   * each energy number is watts * 100, because I only care about two sigfigs.
   * Even those are extraneous.
   *
   * 27 bits (signed)
   * [-67108864, 67108863] or [-671088.64, 671088.63]
   *
   * site, battery, load, solar - all are the "instant_power" values
   * the other values do not need to be here (yet)
   *
   * percent is 14 bits (unsigned)
   * [0, 16383] or [000.00, 163.83]
   *
   * name(bit-length[unsigned]):
   * version(16u)  timestamp(42u)  site(27)  battery(27)   load(27)  solar(27)    percent(14u)
   *
   */

  /* use alloc here because memory needs to be zero */
  const values = [ {
    value: 0,
    resolution: 16
  }, {
    value: 0,
    resolution: 64
  }, {
    value: data.site * 100,
    resolution: 27,
    unsigned: false
  }, {
    value: data.battery * 100,
    resolution: 27,
    unsigned: false
  }, {
    value: data.load * 100,
    resolution: 27,
    unsigned: false
  }, {
    value: data.solar * 100,
    resolution: 27,
    unsigned: false
  }, {
    value: data.percentage * 100,
    resolution: 14
  } ]

  const logFilePath = await getLogFile()
  const writeStream = fs.createWriteStream(logFilePath, { flags: 'a' })
  /* 
   * manually write the timestamp in to the outputBuffer because bitshifting
   * only works out to 32 bits fml
   */
  const outputBuffer = pack(values)

  /* offset is 2 bytes because version takes 2 bytes */
  outputBuffer.writeBigUInt64BE(BigInt(Date.now()), 2)
  writeStream.write(outputBuffer)
  writeStream.end()

  return new Promise(resolve => {
    writeStream.on('finish', () => { resolve() })
  })
}

async function streamLogFile(dateString) {

  const valueTemplate = [ {
    /* version */
    resolution: 16
  }, {
    /* timestamp */
    resolution: 64
  }, {
    /* site */
    resolution: 27,
    unsigned: false
  }, {
    /* battery */
    resolution: 27,
    unsigned: false
  }, {
    /* load */
    resolution: 27,
    unsigned: false
  }, {
    /* solar */
    resolution: 27,
    unsigned: false
  }, {
    /* percentage */
    resolution: 14
  } ]

  const entryLength = getPackLength(valueTemplate)

  const logFilePath = await getLogFile(dateString)
  const readStream = fs.createReadStream(logFilePath)

  /* current byte in the current chunk** */
  let currentByte = 0 
  let inputBuffer = Buffer.allocUnsafe(entryLength)

  let started = false

  const stream = new Transform({
    transform(chunk, encoding, callback) {
      while (currentByte < chunk.length) {
        const byteInEntry = currentByte % entryLength
        chunk.copy(inputBuffer, byteInEntry, currentByte, Math.min(currentByte + (entryLength - byteInEntry), chunk.length))

        /* 
         * wrap over the chunk length 
         *
         * current byte should only be incremented by
         * the remaining bytes in the entry in most cases this should be every
         * byte in the entry, but if there has been a wrap over a chunk boundary,
         * then only add up to the next exact multiple of the entryLength
         */
        currentByte = (currentByte + (entryLength - byteInEntry))
        if (currentByte > chunk.length) {
          currentByte -= chunk.length
          break
        }

        /* 
         * this means that currentByte was advanced the entire entryLength,
         * and the inputBuffer can be unpacked
         */
        if (!(currentByte % entryLength)) {
          /* apparently skipping elements with blanks is bad practice */
          const [ 
            /* version */, 
            /* timestamp */,
            site,
            battery,
            load,
            solar,
            percentage
          ] = unpack(inputBuffer, valueTemplate)
          const timestamp = Number(inputBuffer.readBigUInt64BE(2))
          if (started) stream.push(',')
          stream.push(JSON.stringify({
            timestamp,
            site: site.value / 100,
            battery: battery.value / 100,
            load: load.value / 100,
            solar: solar.value / 100,
            percentage: percentage.value / 100
          }))
          started = true
        }
      }
      callback(null)
    }
  })

  stream.push('[')
  readStream.pipe(stream, { end: false })
  readStream.on('error', () => {
    stream.push(']')
    stream.end()
  })
  readStream.on('end', () => {
    stream.push(']') 
    stream.end() 
  })
  return stream
}

let logNext = false

async function loop() {

  /*
   * if loop() is called again, clear the existing queued loop event
   * this is here to prevent a buildup of a tone of loop events, as
   * a loop() call will be made for every call to the 'auth' endpoint
   *
   */
  clearTimeout(loopId)

  const responseJson = await getBatteryPercentage()

  /* if there is an auth error when getting battery percentage */
  if (!responseJson) {
    const { code, error } = await powerwallAuth() 
    if (code >= 400 && error) {
      /* terminate the loop */
      messageClients('err', JSON.stringify({
        code: 401,
        message: 'Automatic auth failed. User credentials must be re-configured'
      }))
      return 
    }
  }

  const returnJson = {
    timestamp: Date.now(),
    ...await getAggregateData(),
    ...responseJson
  }

  messageClients('dat', JSON.stringify(returnJson))

  loopId = setTimeout(loop, getMsFromNow())

  /* if it's within plus or minus 5 seconds of 5 minute absolute interval */
  if (logNext || (Date.now() + 5000) % (60 * 5 * 1000) < 10000) {
    logNext = false
    writeToLogFile(returnJson)
    messageClients('log', JSON.stringify(returnJson))
  }
}

app.get('/loop', async (req, res) => {
  loop()
  res.status(200).end()
})

app.get('/logdates', async (req, res) => {
  const { date: dateString, before = 3, after = 3 } = req.query

  if (!dateStringIsValid(dateString) || isNaN(Number(before)) || isNaN(Number(after))) {
    res.json({})
    return 
  }

  const [ year, month, day ] = dateString.split('_')
  const date = new Date(year, month - 1, day)

  const diff = Math.max(Math.min(1, Number(before))) + Math.max(Math.min(1, Number(after)))
  for (let a = 0; a < diff; a++) {
  }

})

app.get('/log', async (req, res) => {
  const { date: dateString } = req.query
  const logStream = await streamLogFile(dateString)

  res.setHeader('Content-Type', 'application/json')
  res.writeHead(200)

  logStream.on('data', chunk => {
    res.write(chunk)
  })

  logStream.on('error', err => { res.end(err) })
  logStream.on('end', () => { res.end() })
})

app.get('/writelog', async (req, res) => {
  logNext = true
  res.status(200).end()
})

app.get('/channelconfig', (req, res) => {
  const { date: dateString } = req.query

  let date = new Date()
  if (dateStringIsValid(dateString)) {
    const [ year, month, day ] = dateString.split('_')
    date = new Date(year, month - 1, day)
  }

  date.setHours(0, 0, 0, 0)
  const startTs = date.valueOf()
  date.setDate(date.getDate() + 1)
  res.status(200).json({
    channels: [
      {
        name: 'site',
        group: 'power'
      },
      {
        name: 'battery',
        group: 'power'
      },
      {
        name: 'load',
        group: 'power'
      },
      {
        name: 'solar',
        group: 'power'
      },
      {
        name: 'percentage',
        vMin: 0,
        vMax: 100,
        group: 'other'
      },
      {
        name: 'timestamp',
        vMin: startTs,
        vMax: date.valueOf(),
        visible: false
      }
    ],
    groups: [
      {
        name: 'power',
        channels: [ 0, 1, 2, 3 ]
      },
      {
        name: 'other',
        channels: [ 4 ]
      }
    ]
  })
})

app.post('/auth', async (req, res) => {

  const { code, error } = await getBatteryPercentage()
  /* 
   * code isn't normally there, and neither is error they must both be checked
   * to corroborate an actual auth error, though
   */

  const output = {
    userRecord: loadedConfig.userRecord,
    token: loadedConfig.token,
    success: false
  }

  /* 
   * if there is an error, then attempt to get credentials and re-auth 
   * if credentials were supplied, force a re-auth
   */
  if (code >= 400 && error || (req.body.email || req.body.password)) {
    const config = await readLocalData()

    /* load in stored values from config if they exist */
    let { email, password } = config 

    const errors = []

    if (req.body.email) email = req.body.email
    if (!email) errors.push('e-mail was not specified') 

    if (req.body.password) password = req.body.password
    if (!password) errors.push('password was not specified') 

    if (errors.length) {
      res.status(400).json({
        errors,
        success: false
      })
      return
    }

    if (loadedConfig.email !== email) {
      loadedConfig.email = email
    }
    if (loadedConfig.password !== password) {
      loadedConfig.password = password
    }

    if (configDirty) {
      delete loadedConfig.userRecord
      delete loadedConfig.token
    }

    const { code, error } = await powerwallAuth(email, password)
    if (code >= 400 && error) {
      res.status(code).json({
        errors: [ error ],
        success: false
      })
      return
    }

    writeLocalData()
    output.userRecord = loadedConfig.userRecord
    output.token = loadedConfig.token
    output.success = true
  } else {
    output.success = true
  }

  if (output.success) loop()

  res.json(output)
})


async function begin() {
  await readLocalData()
  const { code, error } = await powerwallAuth()
  if (!code && !error) {
    loop()
  }
  app.listen(PORT, () => { 
    console.log(`server running on port: ${PORT}`) /* do nothing */ 
  })
}

begin()

export {
  powerwallAuth
}
