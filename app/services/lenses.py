"""What each profession and focus wants emphasised, without changing the facts.

The focus is saved on the user from onboarding. It adds one line of guidance
to answers and stories; grounding and citation rules are unchanged.
"""

# Every profession can also choose "explore": a free hand with smaller limits and no videos.
PROFESSIONS = {
    "student": ("exam", "research", "explore"),
    "professor": ("research", "teaching", "explore"),
    "employee": ("legal", "finance", "engineering", "general", "explore"),
}

ANSWER_FOCUS = {
    "exam": "The reader is preparing for an exam: lead with definitions, key facts and what is likely to be asked.",
    "research": "The reader is doing research: be precise, and note methods, evidence and stated limitations.",
    "teaching": "The reader is preparing to teach this: bring out the core ideas, their order and good examples.",
    "legal": "The reader works in legal or compliance: emphasise obligations, rights, deadlines, conditions and risks.",
    "finance": "The reader works in finance or business: emphasise figures, trends, comparisons and risks.",
    "engineering": "The reader works in engineering or IT: emphasise requirements, steps, settings and constraints.",
    "general": "Answer plainly, as a short summary a busy colleague can act on.",
    "explore": "The reader is exploring out of curiosity: answer plainly and briefly, and point out what is most interesting.",
}

STORY_FOCUS = {
    "exam": "Tell it like a friend helping someone revise the night before an exam: make the key points memorable.",
    "research": "Tell it like a lively seminar: what was asked, what was found, and what remains open.",
    "teaching": "Tell it like a great opening lecture that makes students want to read the rest.",
    "legal": "Tell it like a sharp briefing: who must do what, by when, and what happens if they do not.",
    "finance": "Tell it like a confident investor update: the numbers, the trend and the risks.",
    "engineering": "Tell it like a walkthrough by a senior engineer: how it works and what to watch out for.",
    "general": "Tell it like a friendly colleague summarising the document over coffee.",
    "explore": "Tell it like a curious friend sharing the most interesting parts.",
}


def is_valid(profession: str | None, focus: str | None) -> bool:
    return profession in PROFESSIONS and focus in PROFESSIONS[profession]
