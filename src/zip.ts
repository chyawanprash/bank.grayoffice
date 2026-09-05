/**
 * Minimal from-scratch ZIP writer (no deps, no compression - "stored"
 * entries). Used to bundle a batch of rendered documents (e.g. 10 PDFs) into
 * one downloadable file instead of forcing one HTTP round trip per document.
 */

let CRC_TABLE: number[] | null = null;
function crc32(buf: Uint8Array): number {
	if (!CRC_TABLE) {
		CRC_TABLE = [];
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			CRC_TABLE[n] = c >>> 0;
		}
	}
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): number[] {
	return [n & 255, (n >>> 8) & 255];
}
function u32(n: number): number[] {
	return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
}

export interface ZipEntry {
	name: string;
	data: Uint8Array;
}

export function zipFiles(entries: ZipEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const localParts: number[] = [];
	const centralParts: number[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBytes = Array.from(encoder.encode(entry.name));
		const crc = crc32(entry.data);
		const size = entry.data.length;

		const localHeader = [
			...u32(0x04034b50),
			...u16(20), // version needed
			...u16(0), // flags
			...u16(0), // method: stored
			...u16(0), // mod time
			...u16(0), // mod date
			...u32(crc),
			...u32(size), // compressed size
			...u32(size), // uncompressed size
			...u16(nameBytes.length),
			...u16(0), // extra field length
			...nameBytes,
		];
		localParts.push(...localHeader, ...Array.from(entry.data));

		const centralHeader = [
			...u32(0x02014b50),
			...u16(20), // version made by
			...u16(20), // version needed
			...u16(0), // flags
			...u16(0), // method
			...u16(0), // mod time
			...u16(0), // mod date
			...u32(crc),
			...u32(size),
			...u32(size),
			...u16(nameBytes.length),
			...u16(0), // extra field length
			...u16(0), // comment length
			...u16(0), // disk number start
			...u16(0), // internal attrs
			...u32(0), // external attrs
			...u32(offset), // relative offset of local header
			...nameBytes,
		];
		centralParts.push(...centralHeader);

		offset += localHeader.length + entry.data.length;
	}

	const centralDirOffset = offset;
	const centralDirSize = centralParts.length;
	const eocd = [
		...u32(0x06054b50),
		...u16(0), // disk number
		...u16(0), // disk where cd starts
		...u16(entries.length), // records on this disk
		...u16(entries.length), // total records
		...u32(centralDirSize),
		...u32(centralDirOffset),
		...u16(0), // comment length
	];

	return Uint8Array.from([...localParts, ...centralParts, ...eocd]);
}
