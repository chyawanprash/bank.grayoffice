/**
 * Minimal from-scratch PNG renderer (no canvas / no native deps - Workers
 * has neither). Draws a plain-text summary card using a tiny bitmap font and
 * encodes it as an uncompressed ("stored") DEFLATE stream, which is valid
 * PNG per spec without needing a real compressor. Good enough for a visual
 * snapshot of a document; not a pixel-accurate render of the PDF layout.
 */
import type { AnyDocument } from "../types";
import { flattenDocument } from "./tabular";

const FONT: Record<string, string[]> = {
	// 3 wide x 5 tall bitmap glyphs, "1" = pixel on.
	" ": ["000", "000", "000", "000", "000"],
	"0": ["111", "101", "101", "101", "111"],
	"1": ["010", "110", "010", "010", "111"],
	"2": ["111", "001", "111", "100", "111"],
	"3": ["111", "001", "111", "001", "111"],
	"4": ["101", "101", "111", "001", "001"],
	"5": ["111", "100", "111", "001", "111"],
	"6": ["111", "100", "111", "101", "111"],
	"7": ["111", "001", "010", "010", "010"],
	"8": ["111", "101", "111", "101", "111"],
	"9": ["111", "101", "111", "001", "111"],
	"-": ["000", "000", "111", "000", "000"],
	":": ["000", "010", "000", "010", "000"],
	"/": ["001", "001", "010", "100", "100"],
	".": ["000", "000", "000", "000", "010"],
	",": ["000", "000", "000", "010", "100"],
	"$": ["111", "110", "111", "011", "111"],
	"#": ["101", "111", "101", "111", "101"],
	_default: ["111", "101", "101", "101", "111"], // any letter -> generic block glyph, keeps this tiny
};

function glyphFor(ch: string): string[] {
	if (ch >= "a" && ch <= "z") ch = ch.toUpperCase();
	return FONT[ch] ?? FONT._default;
}

const GLYPH_W = 3;
const GLYPH_H = 5;
const SCALE = 2;
const CHAR_GAP = 1;

function drawText(buf: Uint8ClampedArray, width: number, x0: number, y0: number, text: string, color: [number, number, number]) {
	let x = x0;
	for (const ch of text) {
		const glyph = glyphFor(ch);
		for (let gy = 0; gy < GLYPH_H; gy++) {
			for (let gx = 0; gx < GLYPH_W; gx++) {
				if (glyph[gy][gx] !== "1") continue;
				for (let sy = 0; sy < SCALE; sy++) {
					for (let sx = 0; sx < SCALE; sx++) {
						setPixel(buf, width, x + gx * SCALE + sx, y0 + gy * SCALE + sy, color);
					}
				}
			}
		}
		x += (GLYPH_W * SCALE) + CHAR_GAP * SCALE;
	}
}

function setPixel(buf: Uint8ClampedArray, width: number, x: number, y: number, color: [number, number, number]) {
	if (x < 0 || y < 0 || x >= width) return;
	const idx = (y * width + x) * 4;
	if (idx + 3 >= buf.length) return;
	buf[idx] = color[0];
	buf[idx + 1] = color[1];
	buf[idx + 2] = color[2];
	buf[idx + 3] = 255;
}

function fillRect(buf: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number, color: [number, number, number]) {
	for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPixel(buf, width, xx, yy, color);
}

export function renderPng(doc: AnyDocument): Uint8Array {
	const width = 800;
	const height = 600;
	const buf = new Uint8ClampedArray(width * height * 4).fill(255);

	// Header band + synthetic marker
	fillRect(buf, width, 0, 0, width, 40, [30, 41, 59]);
	drawText(buf, width, 20, 14, doc.document_type.toUpperCase().slice(0, 40), [255, 255, 255]);
	fillRect(buf, width, width - 260, 8, 250, 24, [255, 237, 213]);
	drawText(buf, width, width - 250, 14, "DUMMY SYNTHETIC TEST DOC", [180, 60, 0]);

	let y = 60;
	drawText(buf, width, 20, y, `TESTID ${doc.metadata.test_id}`.slice(0, 60), [30, 30, 30]);
	y += 20;
	drawText(buf, width, 20, y, `SCENARIO ${doc.metadata.scenario_id}`.slice(0, 60), [30, 30, 30]);
	y += 20;
	const anyDoc = doc as any;
	if (anyDoc.invoice?.invoice_number) {
		drawText(buf, width, 20, y, `INVOICE ${anyDoc.invoice.invoice_number}`, [30, 30, 30]);
		y += 20;
	}
	if (anyDoc.totals?.grand_total !== undefined) {
		drawText(buf, width, 20, y, `TOTAL ${anyDoc.totals.grand_total}`, [30, 30, 30]);
		y += 20;
	}
	y += 10;
	const { headers, rows } = flattenDocument(doc);
	drawText(buf, width, 20, y, headers.join(" - ").slice(0, 90), [80, 80, 80]);
	y += 20;
	for (const row of rows.slice(0, 20)) {
		if (y > height - 20) break;
		drawText(buf, width, 20, y, row.join(" - ").slice(0, 90), [50, 50, 50]);
		y += 18;
	}

	return encodePng(buf, width, height);
}

// --- Minimal PNG encoder (uncompressed DEFLATE "stored" blocks) -----------

function crc32(buf: Uint8Array): number {
	let c: number;
	const table: number[] = [];
	for (let n = 0; n < 256; n++) {
		c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function adler32(buf: Uint8Array): number {
	let a = 1, b = 0;
	const MOD = 65521;
	for (let i = 0; i < buf.length; i++) {
		a = (a + buf[i]) % MOD;
		b = (b + a) % MOD;
	}
	return ((b << 16) | a) >>> 0;
}

function u32be(n: number): number[] {
	return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = Uint8Array.from(type.split("").map((c) => c.charCodeAt(0)));
	const body = new Uint8Array(typeBytes.length + data.length);
	body.set(typeBytes, 0);
	body.set(data, typeBytes.length);
	const crc = crc32(body);
	const chunk = new Uint8Array(4 + body.length + 4);
	chunk.set(Uint8Array.from(u32be(data.length)), 0);
	chunk.set(body, 4);
	chunk.set(Uint8Array.from(u32be(crc)), 4 + body.length);
	return chunk;
}

function deflateStored(data: Uint8Array): Uint8Array {
	// zlib header (2 bytes) + stored DEFLATE blocks (max 65535 bytes each) + adler32
	const blocks: number[] = [0x78, 0x01];
	let offset = 0;
	while (offset < data.length || offset === 0) {
		const chunk = data.subarray(offset, offset + 65535);
		const isFinal = offset + chunk.length >= data.length;
		blocks.push(isFinal ? 1 : 0);
		const len = chunk.length;
		blocks.push(len & 255, (len >>> 8) & 255);
		const nlen = (~len) & 0xffff;
		blocks.push(nlen & 255, (nlen >>> 8) & 255);
		for (let i = 0; i < chunk.length; i++) blocks.push(chunk[i]);
		offset += chunk.length;
		if (data.length === 0) break;
	}
	const adler = adler32(data);
	blocks.push(...u32be(adler));
	return Uint8Array.from(blocks);
}

function encodePng(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
	// Add filter-type byte (0 = None) at the start of every scanline.
	const stride = width * 4;
	const raw = new Uint8Array((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0;
		raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
	}
	const idatData = deflateStored(raw);

	const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = new Uint8Array(13);
	ihdr.set(u32be(width), 0);
	ihdr.set(u32be(height), 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	const chunks = [pngChunk("IHDR", ihdr), pngChunk("IDAT", idatData), pngChunk("IEND", new Uint8Array(0))];
	const total = signature.length + chunks.reduce((s, c) => s + c.length, 0);
	const out = new Uint8Array(total);
	out.set(signature, 0);
	let off = signature.length;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}
