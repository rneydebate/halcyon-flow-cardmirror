# Halcyon Flow, for Cardmirror

This plugin pastes cards sent from Halcyon Flow into the Cardmirror document you are working in, and
keeps the highlighting.

Use this plugin for formatted sends. The direct connection can send unformatted text and roles.
Flow stops a formatted send if the plugin path is unavailable, so it does not discard your styles.
Reload the updated plugin after replacing this folder. Version 1.2.7 keeps rich formatting when
a command menu has retained Shift-key state.

## Install it

1. In Cardmirror, open Settings, then Plugins.
2. Choose "Load plugin from file..." and pick this folder.
3. That loads it for the session. Cardmirror forgets it when it closes, so repeat this after a
   restart. If Cardmirror is in community mode you can install it permanently from its public
   repository instead, and then it stays.

## Use it

1. Open Halcyon Flow and set Settings, then Send Documents To, to Cardmirror.
2. In Cardmirror, run the command **Halcyon: start auto-sync**. Cards will paste into whichever
   document you are in, as they arrive. Run it again to stop.
3. Or send first and run **Halcyon: paste queued cards now** when you are ready. Cards wait in a
   queue until you collect them, so nothing is lost if you are not looking.

Click into the document you want the cards in before they arrive. They paste where your cursor is,
exactly as if you had pasted them yourself, and your cursor is never moved to another document.
Everything waiting pastes as one batch, in order, with each card, analytic and heading as its own
block: an analytic under a card stays an analytic, and a block on the row after a card keeps its
header.

## The first time you send

Cardmirror asks you to approve Halcyon Flow before it accepts anything. Approve it in Cardmirror,
then send again. It only asks once.

## How it reaches Halcyon Flow

Halcyon Flow runs a small server that answers only on this machine, on a port it picks at random,
behind a token generated fresh each time it starts. The token is written to a file only your user
account can read, in the folder Cardmirror already uses for this. This plugin does not open a
connection itself: it asks Cardmirror to fetch from Halcyon Flow, and Cardmirror does the talking.

The server hands over queued cards and forgets them, so a card is pasted once. Nothing is sent
anywhere except between these two apps on your own machine.

## Jumping back to a card

After a card pastes, the plugin tells Halcyon Flow it landed. That is what makes Halcyon Flow's
"Open Source in CardMirror" work: right-click the cell in Halcyon Flow, choose it, and Cardmirror
scrolls to the pasted card and flashes it so your eye lands on the right spot.

The jump finds the card by its text. If you have pasted the same card twice, the first copy in the
document is the one that gets the jump. A jump is collected on the same schedule as cards: at once
with auto-sync on, or the next time you run **Halcyon: paste queued cards now**. If the card was
deleted from the document, the plugin says it could not find it instead of guessing.

## If nothing arrives

- Is Halcyon Flow open? The queue only exists while it is running.
- Is Halcyon Flow set to send to Cardmirror? Check Settings, then Send Documents To.
- Did you approve Halcyon Flow when Cardmirror asked?
- Is your cursor in a document? Cards paste where the cursor is, and there has to be one.
