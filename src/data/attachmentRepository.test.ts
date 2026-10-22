// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  deleteAttachment,
  readAttachment,
  saveAttachment,
  validateAttachment,
} from './attachmentRepository'

function file(name: string, type: string, size = 8) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('attachmentRepository', () => {
  it('accepts gel evidence file types used in the mouse room', () => {
    expect(validateAttachment(file('gel.jpg', 'image/jpeg'))).toEqual([])
    expect(validateAttachment(file('gel.png', 'image/png'))).toEqual([])
    expect(validateAttachment(file('gel.heic', 'image/heic'))).toEqual([])
    expect(validateAttachment(file('gel.pdf', 'application/pdf'))).toEqual([])
  })

  it('rejects unsupported files and files above 20 MB', () => {
    expect(validateAttachment(file('notes.txt', 'text/plain'))).toContain('File must be JPEG, PNG, HEIC, or PDF.')
    expect(validateAttachment(file('huge-gel.jpg', 'image/jpeg', 20 * 1024 * 1024 + 1))).toContain('File must be 20 MB or smaller.')
  })

  it('saves metadata and original file contents', async () => {
    const gel = file('rgs2-gel.png', 'image/png', 12)

    const metadata = await saveAttachment(gel)
    const restored = await readAttachment(metadata.id)

    expect(metadata).toMatchObject({
      category: 'gel-image',
      originalName: 'rgs2-gel.png',
      mimeType: 'image/png',
      byteSize: 12,
      uploaderLabel: 'Local demo user',
    })
    expect(metadata.id).toMatch(/^attachment-/)
    expect(metadata.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(restored?.size).toBe(12)

    await deleteAttachment(metadata.id)
    expect(await readAttachment(metadata.id)).toBeUndefined()
  })
})
