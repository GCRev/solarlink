import { pack, unpack } from './bitpack.mjs'
import assert from 'assert/strict'

const values = []

for (let a = 0; a < 100; a++) {
  const randomResolution = Math.floor(Math.random() * 30) + 1
  const cap = ~(-1 << (randomResolution))
  let randomValue = Math.floor(Math.floor(Math.random() * cap)) - (cap >> 1)
  values.push({
    value: randomValue,
    resolution: randomResolution,
    unsigned: (randomValue >= 0)
  })
}

values.push({
  value: Date.now(),
  resolution: 48,
  unsigned: true
})

const packedOutput = pack(values)
const unpackedOutput = unpack(packedOutput, values)

for (let a = 0; a < values.length; a++) {
  const beforeValue = values[a]
  const afterValue = unpackedOutput[a]
  assert.equal(beforeValue.value, afterValue.value)
}

console.log('done running test')
