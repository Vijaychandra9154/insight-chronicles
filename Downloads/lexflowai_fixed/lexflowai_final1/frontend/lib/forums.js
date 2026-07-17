export const FORUMS = [
  { value: 'lokayuktha', label: 'Lokayuktha' },
  { value: 'nhrc', label: 'NHRC' },
  { value: 'womens_commission', label: "State Women's Commission" },
  { value: 'rti', label: 'RTI Application' },
  { value: 'consumer_forum', label: 'Consumer Forum' },
  { value: 'district_court', label: 'District Court' },
]

export function forumLabel(value) {
  return FORUMS.find((f) => f.value === value)?.label || value || 'Unspecified'
}
