export const FORUMS = [
  { value: 'lokayuktha', label: 'Lokayuktha' },
  { value: 'nhrc', label: 'NHRC' },
  { value: 'shrc', label: "State Human Rights Commission" },
  { value: 'womens_commission', label: "State Women's Commission" },
  { value: 'rti', label: 'RTI Application' },
  { value: 'rti_second_appeal', label: 'RTI Second Appeal (CIC/SIC)' },
  { value: 'consumer_forum', label: 'Consumer Forum' },
  { value: 'district_court', label: 'District Court' },
  { value: 'police_complaint', label: 'Police / Cyber Crime Complaint' },
  { value: 'labour_commissioner', label: 'Labour Commissioner' },
  { value: 'mact', label: 'Motor Accident Claims Tribunal' },
  { value: 'cheque_bounce', label: 'Cheque Bounce (Section 138 NI Act)' },
  { value: 'rera', label: 'RERA (Real Estate Regulatory Authority)' },
  { value: 'domestic_violence', label: 'Domestic Violence (PWDVA)' },
  { value: 'senior_citizens_maintenance', label: 'Senior Citizens Maintenance Tribunal' },
  { value: 'posh_complaint', label: 'Workplace Sexual Harassment (POSH)' },
  { value: 'cat', label: 'Central Administrative Tribunal (CAT)' },
]

export function forumLabel(value) {
  return FORUMS.find((f) => f.value === value)?.label || value || 'Unspecified'
}
