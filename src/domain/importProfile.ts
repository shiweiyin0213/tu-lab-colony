import type { BreedingCage, IndividualCage } from '../types'

export interface ImportProfileFieldValue {
  label: string
  count: number
}

export interface ImportProfileField {
  name: string
  total: number
  values: ImportProfileFieldValue[]
}

export interface ImportProfile {
  fields: ImportProfileField[]
  sidebarFilters: string[]
}

export function buildImportProfile(rows: Array<BreedingCage | IndividualCage>): ImportProfile {
  const fieldCounts = new Map<string, Map<string, number>>()

  rows.forEach((row) => {
    Object.entries(row.customFields ?? {}).forEach(([field, rawValue]) => {
      const value = rawValue.trim()
      if (!field || !value) return
      const count = 'count' in row ? row.count : 1
      const values = fieldCounts.get(field) ?? new Map<string, number>()
      values.set(value, (values.get(value) ?? 0) + count)
      fieldCounts.set(field, values)
    })
  })

  const fields = Array.from(fieldCounts.entries())
    .map(([name, values]) => {
      const sortedValues = Array.from(values.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      return {
        name,
        total: sortedValues.reduce((sum, value) => sum + value.count, 0),
        values: sortedValues,
      }
    })
    .filter((field) => field.values.length > 1 && field.values.length <= 8)
    .sort((a, b) => fieldPriority(b.name) - fieldPriority(a.name) || b.total - a.total || a.name.localeCompare(b.name))

  return {
    fields,
    sidebarFilters: fields.slice(0, 6).map((field) => field.name),
  }
}

function fieldPriority(name: string) {
  return /status|phenotype|condition|outcome|hearing|vision|tumou?r|treatment/i.test(name) ? 1 : 0
}
