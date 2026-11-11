# ChatRow

New part, built from Kiln tokens. One line of the interview transcript.

Why: the transcript is the main working surface. It should read like a conversation on paper, not like chat-app bubbles in brand colours.

**The consumer provides:** `from` (`you` or `tool`), the text, and optionally a `label` ("Question 2") or `quiet` (for the tool's own bookkeeping).

* The requester's words sit on the right, on `paper-sunk`. The tool's questions are plain `ink` under a mono label.
* Screen readers hear "You:" before the requester's words.
* Flags, blocks and completions are not ChatRows. Use Notice for them.
