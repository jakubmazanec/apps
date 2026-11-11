const IMPORT_SECTION = 2;
const MEMORY_IMPORT = 2;
const SHARED_WITH_MAXIMUM = 0x03;

export function readMemoryLimits(bytes: Uint8Array): {initial: number; maximum: number} {
  let offset = 8; // magic, version

  let readByte = () => {
    let byte = bytes[offset];
    offset += 1;

    if (byte === undefined) {
      throw new RangeError('The module ends inside a section.');
    }

    return byte;
  };

  // Unsigned LEB128
  let readNumber = () => {
    let value = 0;
    let shift = 0;
    let byte;

    do {
      byte = readByte();
      value += (byte % 0x80) * 2 ** shift;
      shift += 7;
    } while (byte >= 0x80);

    return value;
  };

  let readName = () => {
    let length = readNumber();
    let name = new TextDecoder().decode(bytes.subarray(offset, offset + length));
    offset += length;

    return name;
  };

  while (offset < bytes.length) {
    let id = readByte();
    let size = readNumber();

    if (id !== IMPORT_SECTION) {
      offset += size;

      continue;
    }

    readNumber(); // import count

    if (
      readName() !== 'env' ||
      readName() !== 'memory' ||
      readByte() !== MEMORY_IMPORT ||
      readByte() !== SHARED_WITH_MAXIMUM
    ) {
      throw new TypeError('The first import must be a shared env.memory with a maximum.');
    }

    return {initial: readNumber(), maximum: readNumber()};
  }

  throw new TypeError('The module has no import section.');
}
