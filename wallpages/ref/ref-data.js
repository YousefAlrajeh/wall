/* FTM wall (reference design) - SAMPLE DATA ONLY.
   Every value below is a placeholder copied from the user's design image (FTM_wall_final, 3 Nov 2026).
   None of it is real. Power BI values replace this one object later; the pages draw everything
   (numbers, bars, rings, map circles, Target flags) from it. Plain values only: no names of people,
   no case numbers, no free text. */
window.REF_DATA = {
  sample: true,
  updated: "10:42",
  ecc: {
    callsToday: 1248,
    callsPerHour: { hours: ["00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00","08:00","09:00","10:00"],
                    values: [81, 66, 57, 47, 53, 72, 111, 151, 189, 204, 217] },
    /* rule = how the Target is worded and judged (the pill follows the label wording):
       "higher": label "Target X", higher is better: X or above = On Target, below X = Below Target.
       "under":  label "Target under X": strictly below X = On Target, equal to X = Not under Target, above X = Above Target.
       "atMost": label "Target X", lower is better (step minutes): X or less = On Target, above X = Above Target. */
    answered:       { value: 96, target: 95, rule: "higher" },
    answeredInTime: { value: 91, target: 90, rule: "higher" },
    dispatchedInTime: { value: 88, target: 90, rule: "higher" },
    abandoned:      { value: 3,  target: 5,  rule: "under" },
    cancellationsTop5: [ { name: "Riyadh North", value: 14 }, { name: "Jeddah", value: 11 }, { name: "Riyadh East", value: 9 },
                         { name: "Makkah", value: 7 }, { name: "Dammam", value: 5 } ],
    /* share of today's cases per CTAS level (0..1, unrounded); the label shows it rounded to a whole percent.
       Sample shares are measured from the design image's bar (segment px / 1648 px). */
    ctasShare: [ { name: "CTAS 1", share: 76 / 1648 }, { name: "CTAS 2", share: 277.6 / 1648 }, { name: "CTAS 3", share: 630.4 / 1648 },
                 { name: "CTAS 4", share: 462.4 / 1648 }, { name: "CTAS 5", share: 201.6 / 1648 } ],
    /* minutes; label "Target X", rule "atMost" (see above): flagged only when above its Target */
    stepsRule: "atMost",
    steps: [ { name: "Call Processing", value: 1, target: 1 }, { name: "Dispatch Activation", value: 1, target: 1 },
             { name: "Dispatch Processing", value: 2, target: 2 }, { name: "Bed Availability", value: 6, target: 10 },
             { name: "Medical Endorsement", value: 4, target: 5 }, { name: "Insurance Approval", value: 9, target: 15 },
             { name: "Dispatch Time", value: 3, target: 3 } ]
  },
  fm: {
    eventsRunning: 37,
    cities: 9,
    projects: 14,
    patientsToday: 486,
    startingToday: ["Winter Marathon", "Heritage Festival", "Tech Summit"],
    endingToday: ["Desert Rally", "Book Fair"],
    zonesUnderPlan: ["Zone B, Riyadh", "Zone D, Jeddah", "Zone A, AlUla"],
    otherEvents: ["Camel Festival", "Air Show", "Food Week", "Esports Cup", "Jazz Nights", "Horse Race", "Golf Open", "Car Show"],
    /* events running now per city (map circles); circle area follows the count */
    eventsByCity: [ { city: "Riyadh", n: 12 }, { city: "Jeddah", n: 8 }, { city: "Makkah", n: 4 }, { city: "Madinah", n: 3 },
                    { city: "Dammam", n: 3 }, { city: "AlUla", n: 2 }, { city: "Abha", n: 2 }, { city: "Tabuk", n: 2 },
                    { city: "Al Khobar", n: 1 } ]
  },
  mt: {
    missionsCompleted: 214,
    casesDispatched: 236,
    unitsLoggedIn: 58,
    busyNow: 41,
    missionsPerHour: { hours: ["00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00","08:00","09:00","10:00"],
                       values: [14, 11, 10, 8, 9, 12, 19, 26, 32, 35, 38] },
    busiestTop5: [ { name: "Riyadh North", value: 38 }, { name: "Riyadh East", value: 31 }, { name: "Jeddah", value: 29 },
                   { name: "Makkah", value: 22 }, { name: "Dammam", value: 17 } ],
    /* minutes; target null = no Target shown; rule "atMost" (see the ecc comment) */
    stepsRule: "atMost",
    steps: [ { name: "Chute", value: 2, target: null }, { name: "En route", value: 9, target: null },
             { name: "Response", value: 11, target: 10 }, { name: "On scene", value: 14, target: null },
             { name: "Patient on scene", value: 12, target: null }, { name: "Transfer preparation", value: 6, target: null },
             { name: "Transport", value: 18, target: null }, { name: "Transfer of care", value: 10, target: null },
             { name: "Turnaround", value: 7, target: null }, { name: "Back to station", value: 15, target: null },
             { name: "Back in service", value: 3, target: null } ]
  }
};
