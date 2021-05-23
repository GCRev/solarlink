const sizeB = 8

function length(values) {
  return Math.ceil(values.reduce(( accum, valueObject ) => {
    return accum += valueObject.resolution
  }, 0) / sizeB)
}

function pack(values) {
  /* 
   * values is an array of value objects in which:
   * {
   *   value: Number,
   *   resolution: Number - length of number in bits
   * }
   *
   * this array is written in order
   *
   */
  let bitsLeft = 0
  let currentIndex = 0
  let startOfByte = 0
  let startBit = 0

  /* alloc buffer to length of all values combined */
  const outputBuffer = Buffer.alloc(length(values))

  for (let a = 0; a < values.length; a++) {
    let { value: result, resolution: res } = values[a]

    /* set the current bit to start writing from in the output buffer */
    let currentBit = startBit
    startBit += res

    /* bits left is always reset to the pre-defined resolution per value iteration */
    bitsLeft = res
    while (bitsLeft > 0) {
      // calculate the current index to start on
      currentIndex = Math.floor(currentBit / sizeB)

      // calculate the absolute start of the buffer byte
      startOfByte = currentIndex * sizeB

      /*
       * calculate the number of bits to write:
       *  must be less than the number of bits left
       *  the second term here is remaining bits to write within this byte 
       */
      const writeBits = Math.min(bitsLeft, startOfByte + sizeB - currentBit)

      /*
       * create a mask for the writeBits so no other bits from the result
       * are written to the output byte
       *
       * -1 is all 1's, shift zeroes over the writeBits, invert the entire thing
       */
      const mask = ~(-1 << writeBits)

      /*
       * actually write to the output byte
       * remember to bit shift the masked result correctly within the current
       * byte so that it does not overlap with the previously-written data
       * in the same byte
       */
      outputBuffer[currentIndex] |= (result & mask) << (currentBit - startOfByte)

      /* keep track of where to start the next calculation */
      currentBit += writeBits
      
      /* otherwise the loop runs FOREVER :0 */
      bitsLeft -= writeBits

      /* 
       * this makes the masking step from earlier simpler 
       * on subsequent runs of this while loop
       */
      result >>= writeBits
    }
  }
  return outputBuffer
}

function unpack(inputBuffer, values) {
  /*
   * consumes a buffer and a values array like the one above, only the 'value' key is omitted
   *
   * returns a values array like the the input to the pack function,
   * but fills out the value for each item
   *
   * this array is read in order
   * values is an array of value objects in which:
   * {
   *   value: Number,
   *   resolution: Number - length of number in bits
   *   unsigned: Boolean(true) - default to unsigned unless otherwise specified
   * }
   *
   * this needs "signed" in order to interpret the value,
   * because that information is lost otherwise
   *
   */
  let startBit = 0
  const outputValues = []
  for (let a = 0; a < values.length; a++) {
    const { resolution, unsigned = true } = values[a]
    let bitsLeft = resolution
    let value = 0
    while (bitsLeft > 0) {
      const bitsWritten = resolution - bitsLeft
      let currentIndex = Math.floor(startBit / sizeB)
      const startOfData = startBit - currentIndex * sizeB
      const writeBits = Math.min(bitsLeft, sizeB - startOfData)
      const mask = ~(-1 << writeBits)
      value |= ((inputBuffer[currentIndex] >> startOfData) & mask) << bitsWritten
      bitsLeft -= writeBits
      startBit += writeBits
    }
    if (!unsigned) {
      /* 
       * check the bit at resolution
       * if it's 1 then set all bits to 1 between 64 and resolution to 1
       */
      const sign = (value >> (resolution - 1)) & 1
      if (sign) {
        value |= (-1 << resolution)
      }
    }
    outputValues.push({
      ...values[a],
      value 
    })
  }
  return outputValues
}

export {
  pack,
  unpack,
  length
}

