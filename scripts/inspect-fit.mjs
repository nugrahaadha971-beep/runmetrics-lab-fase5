// Pemakaian: node scripts/inspect-fit.mjs <file.fit>
// Mencetak bentuk keluaran fit-file-parser dan hasil pemetaannya, untuk memverifikasi API dengan file FIT nyata.
import { readFile } from 'node:fs/promises'
import { fitParseRaw, mapFitData } from '../src/utils/fileParsers.js'

const path = process.argv[2]
if (!path) {
  console.error('Pemakaian: node scripts/inspect-fit.mjs <file.fit>')
  process.exit(1)
}
const buf = await readFile(path)
const raw = await fitParseRaw(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
console.log('Kunci data     :', Object.keys(raw))
console.log('Jumlah record  :', raw.records?.length, '| lap:', raw.laps?.length, '| sesi:', raw.sessions?.length)
console.log('Sesi pertama   :', raw.sessions?.[0])
console.log('Record pertama :', raw.records?.[0])
console.log('Record tengah  :', raw.records?.[Math.floor((raw.records?.length ?? 0) / 2)])
const { summary, stream } = mapFitData(raw, path.split('/').pop())
console.log('\nRingkasan hasil pemetaan:', summary)
console.log('Contoh stream  :', stream?.records.slice(0, 3), '... total', stream?.records.length)
console.log('Lap pertama    :', stream?.laps[0])
