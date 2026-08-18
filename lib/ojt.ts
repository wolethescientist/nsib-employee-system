// The "Aircraft Accident Investigator OJT Progress Chart", as the bureau's paper
// form defines it. A chart is opened against a trainee, and each task is signed
// off at three levels as they progress.

/** The tasks a new chart starts with, in the order they appear on the form. */
export const OJT_TASKS: { task: string; source: string }[] = [
  { task: 'Review Annex 13 and Doc 9756', source: 'Initial/Basic' },
  { task: 'Notification Procedures', source: 'Initial/Basic' },
  { task: 'Collection of Factual Information (documenting evidence, witness interview, transcription of CVR recordings)', source: 'Initial/Basic' },
  { task: 'Analysis', source: 'Initial/Basic' },
  { task: 'Writing draft Final Report', source: 'Initial/Basic' },
  { task: 'Use of investigation equipment (GPS, camera)', source: 'Initial/Basic' },
  { task: 'Attachment to participate in an ongoing or new small aircraft accident investigation', source: 'Basic' },
  { task: 'Attachment to participate in an ongoing or new serious incident or small accident investigation', source: 'Basic' },
  { task: 'Attachment to participate in an ongoing or new major aircraft accident investigation', source: 'Advanced' },
  { task: 'Attachment to participate in a second ongoing or new major aircraft accident investigation', source: 'Advanced' },
]

export type OjtLevel = 1 | 2 | 3

/** The form's own guide: what the trainee does at each level, and the instructor. */
export const OJT_LEVELS: { level: OjtLevel; name: string; trainee: string; instructor: string; guide: string }[] = [
  {
    level: 1,
    name: 'Level I — Knowledge',
    trainee: 'Study',
    instructor: 'Discuss',
    guide:
      'Typically self-study by the trainee, with guided discussion and validation by the OJT instructor afterwards. Level I may be waived where the trainee has already attended formal classroom or computer-based training on the task.',
  },
  {
    level: 2,
    name: 'Level II — Understanding',
    trainee: 'Observe',
    instructor: 'Demonstrate',
    guide:
      'Review the technical requirements, assess the trainee’s existing knowledge and skill, demonstrate the task while the trainee observes, and motivate the trainee.',
  },
  {
    level: 3,
    name: 'Level III — Performance',
    trainee: 'Perform',
    instructor: 'Evaluate',
    guide:
      'Observe the trainee perform the task, allow enough time to practise, ask questions to check understanding, then evaluate and give feedback.',
  },
]

/**
 * Level III is the only level with a validation gate on the paper form: the
 * instructor must be able to answer "Yes" to all four before signing.
 *
 * ponytail: the answers are not stored column by column. The signature IS the
 * record that all four were answered yes — that is what the form says it means.
 * Give them their own table only if someone has to audit the individual answers.
 */
export const LEVEL3_CHECKS = [
  'Did the trainee demonstrate sufficient knowledge to accurately complete the task?',
  'Did the trainee demonstrate all steps necessary to proficiently complete the task?',
  'Were the steps completed in the proper order?',
  'Did the trainee perform the task in a timely manner and without assistance?',
]
