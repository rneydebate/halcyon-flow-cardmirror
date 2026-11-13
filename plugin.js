// Halcyon Flow, as a Cardmirror plugin.
//
// WHAT THIS IS FOR. Halcyon Flow can send cards to Cardmirror two ways. The direct bridge carries
// text and a role per line, which is enough for structure but drops highlighting. This plugin is
// the other way: Halcyon Flow queues each card as rich HTML, this plugin collects the queue and
// pastes it in, so highlights, underlines, the cite and the card structure all survive.
//
// HOW IT WORKS. Halcyon Flow registers itself with Cardmirror as a "flow app" - a tiny local server
// that answers only on this machine, behind a token that lives in a file only your user account can
// read. This plugin asks Cardmirror to fetch from it, so the plugin never opens a socket itself and
// Halcyon Flow never pushes anything at Cardmirror uninvited.
//
// Pasting is done by handing Cardmirror's own editor a paste event carrying text/html, which is the
// same path a Ctrl+V takes. That is deliberate: it means the card arrives through the importer that
// is already tested, and it does not steal your focus or move your cursor to another document.

(function registerHalcyonFlowPlugin() {
  var APP_ID = 'halcyon-flow';
  var POLL_MS = 700;

  var timer = null;
  var inFlight = false;

  function note(api, message) {
    // Cardmirror may or may not offer a notifier; say it in the console either way so a failure is
    // never silent.
    try { if (api && typeof api.notify === 'function') api.notify(message); } catch (e) { /* ignore */ }
    try { console.log('[Halcyon Flow] ' + message); } catch (e) { /* ignore */ }
  }

  // Is Halcyon Flow registered and running right now?
  //
  // flowApps() answers with a promise, so this does too. Reading it as a plain array is the easy
  // mistake here and it fails silently - a promise is truthy and has no length, so every check
  // would just say "not running".
  function flowAppIsRunning(api) {
    if (!api || typeof api.flowApps !== 'function') return Promise.resolve(false);
    return Promise.resolve(api.flowApps())
      .then(function (apps) {
        if (!apps || !apps.length) return false;
        for (var i = 0; i < apps.length; i += 1) {
          if (apps[i] && apps[i].id === APP_ID) return !!apps[i].running;
        }
        return false;
      })
      .catch(function () { return false; });
  }

  // The editor the user is actually in. Cardmirror is a ProseMirror app, so the contenteditable
  // that currently holds focus is the right target; fall back to the first one on the page.
  function activeEditorElement() {
    var active = document.activeElement;
    if (active && active.closest) {
      var owned = active.closest('.ProseMirror');
      if (owned) return owned;
    }
    return document.querySelector('.ProseMirror');
  }

  // Paste one card's HTML the way a real paste arrives.
  function pasteHtml(html) {
    var target = activeEditorElement();
    if (!target) return false;
    var data = new DataTransfer();
    data.setData('text/html', html);
    // This is an explicit rich send, not the user's clipboard. ProseMirror can retain Shift
    // while a command menu owns focus; supplying text/plain then selects its plain-paste path
    // and discards every mark. HTML alone keeps this send rich without changing keyboard state.
    var event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return true;
  }

  // Each queued card may carry a `data-halcyon-cid` attribute on its root tag - Halcyon
  // Flow's per-card identity. Reporting the pasted cids back (/landed) is what lets Flow's
  // "Open Source in CardMirror" know the card is really in the document.
  function cidOf(html) {
    var m = /data-halcyon-cid="([^"]+)"/.exec(String(html || ''));
    return m ? m[1] : null;
  }

  // Jump the editor to the card whose TEXT anchor matches: find the block whose text
  // contains the anchor, scroll it into view, and flash an outline so the eye lands.
  // First match wins (a duplicated tag is ambiguous by nature; Halcyon Flow documents that).
  function jumpToText(anchor) {
    if (!anchor) return false;
    var editors = document.querySelectorAll('.ProseMirror');
    for (var e = 0; e < editors.length; e += 1) {
      var blocks = editors[e].querySelectorAll('p, h1, h2, h3, h4, div');
      for (var i = 0; i < blocks.length; i += 1) {
        var el = blocks[i];
        if ((el.textContent || '').indexOf(anchor) !== -1) {
          el.scrollIntoView({ block: 'center' });
          var prev = el.style.outline;
          el.style.outline = '2px solid #1d4ed8';
          setTimeout(function () { el.style.outline = prev; }, 1200);
          return true;
        }
      }
    }
    return false;
  }

  // Collect pending jump requests and run them. Silent when there are none.
  function drainJumps(api) {
    return Promise.resolve()
      .then(function () { return api.flowPost(APP_ID, '/jump', {}); })
      .then(function (reply) {
        var body = reply && reply.ok ? reply.body : null;
        var jumps = body && body.ok && Array.isArray(body.jumps) ? body.jumps : [];
        for (var i = 0; i < jumps.length; i += 1) {
          var j = jumps[i] || {};
          if (!jumpToText(j.text)) {
            note(api, 'Could not find the card "' + String(j.text || '').slice(0, 60) + '" in the open document.');
          }
        }
        return jumps.length;
      })
      .catch(function () { return 0; });
  }

  // Collect whatever Halcyon Flow has queued and paste it. Returns the number pasted.
  function drainOnce(api, announce) {
    if (inFlight) return Promise.resolve(0);
    inFlight = true;
    return Promise.resolve()
      .then(function () { return api.flowPost(APP_ID, '/pending', {}); })
      .then(function (reply) {
        var body = reply && reply.ok ? reply.body : null;
        var cards = body && body.ok && Array.isArray(body.cards) ? body.cards : [];
        if (!cards.length) {
          if (announce) note(api, 'Nothing is waiting to be pasted.');
          return 0;
        }
        // ONE paste for the whole batch (1.1.9). Pasting each card on its own let the editor decide
        // paragraph boundaries by NEIGHBOURS: a paste lands where the last one left the cursor, at
        // the end of the previous item's paragraph, and a pasted paragraph's open start merges
        // into it. Analytics after a card arrived as the card's body until the last one, and a
        // block header on the row after a card glued itself onto the card's last line. In one
        // batch every item is a closed sibling block with its own role, and the empty paragraph at
        // the front is the one thing the open start can merge into, so nothing real is absorbed.
        var batch = '<p></p>' + cards.join('');
        var landedCids = [];
        for (var i = 0; i < cards.length; i += 1) {
          var cid = cidOf(cards[i]);
          if (cid) landedCids.push(cid);
        }
        var pasted = pasteHtml(batch) ? cards.length : 0;
        if (pasted && landedCids.length) {
          // Best-effort landing report; a failure costs only "Open Source" precision.
          Promise.resolve()
            .then(function () { return api.flowPost(APP_ID, '/landed', { cids: landedCids }); })
            .catch(function () { /* ignore */ });
        }
        if (pasted < cards.length) {
          // The queue is already drained, so saying nothing here would lose cards silently.
          note(api, 'Pasted ' + pasted + ' of ' + cards.length + ' cards. Click into a document and send again for the rest.');
        } else if (announce) {
          note(api, 'Pasted ' + pasted + (pasted === 1 ? ' card.' : ' cards.'));
        }
        return pasted;
      })
      .catch(function (error) {
        note(api, 'Could not collect cards from Halcyon Flow. ' + (error && error.message ? error.message : ''));
        return 0;
      })
      .then(function (n) { inFlight = false; return n; });
  }

  function stopAutoSync() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function startAutoSync(api) {
    if (timer) {
      stopAutoSync();
      note(api, 'Auto-sync stopped.');
      return;
    }
    flowAppIsRunning(api).then(function (up) {
      if (!up) {
        note(api, 'Halcyon Flow is not running. Open Halcyon Flow, then start auto-sync again.');
        return;
      }
      timer = setInterval(function () { drainOnce(api, false); drainJumps(api); }, POLL_MS);
      note(api, 'Auto-sync started. Cards sent from Halcyon Flow will paste into the document you are in.');
    });
  }

  if (typeof window.__registerCardMirrorPlugin !== 'function') return;
  window.__registerCardMirrorPlugin({
    id: APP_ID,
    name: 'Halcyon Flow',
    apiVersion: 1,
    commands: [
      {
        id: 'halcyon-flow.auto-sync',
        label: 'Halcyon: start auto-sync',
        keywords: ['halcyon', 'flow', 'sync', 'auto', 'paste', 'cards'],
        run: function (api) { startAutoSync(api); },
      },
      {
        id: 'halcyon-flow.paste-now',
        label: 'Halcyon: paste queued cards now',
        keywords: ['halcyon', 'flow', 'paste', 'queued', 'cards', 'now'],
        run: function (api) {
          flowAppIsRunning(api).then(function (up) {
            if (!up) {
              note(api, 'Halcyon Flow is not running. Open Halcyon Flow and send again.');
              return;
            }
            drainOnce(api, true).then(function () { drainJumps(api); });
          });
        },
      },
    ],
  });
})();
