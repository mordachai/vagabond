
/**
 * Locked compendium content: unlock setting, challenge dialog, Compendium Directory button.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerContentUnlock() {
  /* -------------------------------------------- */
  /* Vagabond System - Secure Content Manager     */
  /* -------------------------------------------- */

  const SYSTEM_ID = "vagabond";
  const SETTING_KEY = "contentUnlocked";

  /* -------------------------------------------- */
  /* CHALLENGE DATABASE (Base64 Method)           */
  /* -------------------------------------------- */
  const CHALLENGES = [
    {
      "id": "x7k9p", // Answer: ruin
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNhdXNlcyB5b3UgdG8gbG9zZSBhbGwgbGFuZCwgcG9zc2Vzc2lvbnMsIGFuZCB3ZWFsdGg/",
      "h": ["cnVpbg=="] 
    },
    {
      "id": "m2j4q", // Answer: fool
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIG1ha2VzIHlvdSBsb3NlIDEgTGV2ZWwgYW5kIGRyYXcgYW5vdGhlciBjYXJkPw==",
      "h": ["Zm9vbA=="]
    },
    {
      "id": "b5v8n", // Answer: rogue
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNhdXNlcyBhIGZyaWVuZCB0byBwZXJtYW5lbnRseSBoYXRlIHlvdT8=",
      "h": ["cm9ndWU="]
    },
    {
      "id": "w9c1r", // Answer: flames
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGNyZWF0ZXMgYSBwb3dlcmZ1bCBIZWxsc3Bhd24gZW5lbXk/",
      "h": ["ZmxhbWVz"]
    },
    {
      "id": "q3z6l", // Answer: key
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB5b3UgYSBGYWJsZWQgUmVsaWMgb2YgeW91ciBjaG9pY2U/",
      "h": ["a2V5"]
    },
    {
      "id": "p0o5t", // Answer: knight
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB0aGUgc2VydmljZSBvZiBhbiBBbGx5IGNoYW1waW9uIGNvbXBhbmlvbj8=",
      "h": ["a25pZ2h0"]
    },
    {
      "id": "y2x4u", // Answer: idiot
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGRlY3JlYXNlcyB5b3VyIFJlYXNvbiBieSBkNj8=",
      "h": ["aWRpb3Q="]
    },
    {
      "id": "r8n1s", // Answer: comet
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIHJlcXVpcmVzIHlvdSB0byBkZWZlYXQgdGhlIG5leHQgRW5lbXkgYWxvbmUgdG8gZ2FpbiBhIExldmVsPw==",
      "h": ["Y29tZXQ="]
    },
    {
      "id": "k6m3d", // Answer: jester
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB5b3UgMSBMZXZlbCBvciBsZXRzIHlvdSBkcmF3IHR3byBjYXJkcz8=",
      "h": ["amVzdGVy"]
    },
    {
      "id": "g4h7j", // Answer: omlarcat
      "q": "SW4gdGhlIHJlbGljIENsb2FrIG9mIERpc3BsYWNlbWVudCB3aGF0IGNyZWF0dXJlJ3MgZnVyIGlzIHRoZSBjb2F0IG1hZGUgZnJvbT8=",
      "h": ["b21sYXJjYXQ="]
    },
    {
      "id": "l9k2p", // Answer: darksight
      "q": "SW4gdGhlIHJlbGljIEJsYWNrIFdpbmcgd2hhdCB2aXNpb24gYWJpbGl0eSBkb2VzIGl0IGdyYW50IHdoaWxlIGVxdWlwcGVkPw==",
      "h": ["ZGFya3NpZ2h0"]
    },
    {
      "id": "v1f5c", // Answer: balance
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGluY3JlYXNlcyB0aGUgYm9udXMgb2YgdGhyZWUgUmVsaWNzIGJ5IDE/",
      "h": ["YmFsYW5jZQ=="]
    },
    {
      "id": "d3s9a", // Answer: moon
      "q": "SW4gdGhlIHJlbGljIERlY2sgb2YgTWFueSBUaGluZ3Mgd2hhdCBjYXJkIGdyYW50cyB0aHJlZSB3aXNoZXMgdGhhdCBtdXN0IGJlIG1hZGUgd2l0aGluIDEwIG1pbnV0ZXM/",
      "h": ["bW9vbg=="]
    }
  ];

  /* -------------------------------------------- */
  /* Initialization & Settings                   */
  /* -------------------------------------------- */

  Hooks.once('init', () => {
    game.settings.register(SYSTEM_ID, SETTING_KEY, {
      name: 'Content Unlocked',
      scope: 'world',
      config: false,
      type: Boolean,
      default: false
    });
  });

  /* -------------------------------------------- */
  /* UI Interaction (Compendium Directory)       */
  /* -------------------------------------------- */

  Hooks.on('renderCompendiumDirectory', (app, html, data) => {
    const isUnlocked = game.settings.get(SYSTEM_ID, SETTING_KEY);
    const directoryElement = html instanceof HTMLElement ? html : html[0];
  
    if (isUnlocked) {
      const existingBtn = directoryElement.querySelector('#vagabond-unlock-btn');
      if (existingBtn) existingBtn.remove();
      return;
    }

    // Hide Packs
    game.packs.forEach(pack => {
      if (pack.metadata.packageName === SYSTEM_ID) {
        const packElement = directoryElement.querySelector(`[data-pack="${pack.collection}"]`);
        if (packElement) packElement.remove();
      }
    });

    // Cleanup folders
    directoryElement.querySelectorAll('.directory-group').forEach(dir => {
      const list = dir.querySelector('ol');
      if (list && list.children.length === 0) dir.style.display = 'none';
    });

    // Only show unlock button to GMs — players get access once the GM unlocks
    if (!game.user.isGM) return;

    // Inject Button
    if (!directoryElement.querySelector('#vagabond-unlock-btn')) {
      const unlockBtn = document.createElement("button");
      unlockBtn.id = "vagabond-unlock-btn";
      unlockBtn.innerHTML = `<i class="fas fa-key"></i> Unlock System Content`;
      unlockBtn.style.cssText = `
      width: 96%; margin: 10px 2%; padding: 8px;
      background: #222; color: #fff; border: 1px solid #444;
      cursor: pointer; font-family: monospace; text-transform: uppercase;
    `;
      unlockBtn.onclick = (e) => {
        e.preventDefault();
        promptRandomChallenge();
      };

      const header = directoryElement.querySelector('.directory-header');
      if (header) header.after(unlockBtn);
      else directoryElement.prepend(unlockBtn);
    }
  });

  /* -------------------------------------------- */
  /* Logic & Dialogs (BASE64 METHOD)             */
  /* -------------------------------------------- */

  async function promptRandomChallenge() {
    if (CHALLENGES.length === 0) {
      ui.notifications.warn("No challenges configured.");
      return;
    }

    const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    const questionText = decodeURIComponent(escape(window.atob(challenge.q)));
  
    const { DialogV2 } = foundry.applications.api;

    const userResponse = await DialogV2.wait({
      window: { 
          title: "Security Check",
          icon: "fas fa-user-secret"
      },
      content: `
      <div style="text-align: center; padding: 10px;">
        <h5 style="font-weight: bold; margin-bottom: 10px;">${questionText}</h5>
        <p style="margin-bottom: 10px;">One word answer:</p>
        <div class="form-group">
            <input type="password" name="unlock-attempt" id="secret-attempt" placeholder="Answer..." style="text-align: center; width: 100%;" autofocus>
        </div>
      </div>
    `,
      buttons: [{
        action: "submit",
        label: "Verify",
        icon: "fas fa-check",
        callback: (event, button, dialog) => {
          return dialog.element.querySelector('#secret-attempt').value;
        }
      }],
      submit: (result) => {
          return result["unlock-attempt"]; 
      },
      close: () => { return null; }
    });

    if (!userResponse) return;

    const cleanInput = userResponse.trim().toLowerCase();

    // -- MASTER OVERRIDE --
    if (cleanInput === "vagabond_override") {
        ui.notifications.info("Master Key Accepted.");
        await game.settings.set(SYSTEM_ID, SETTING_KEY, true);
        ui.sidebar.render();
        return;
    }
  
    // -- BASE64 CONVERSION --
    // This uses standard browser encoding. It is consistent everywhere.
    const encodedAttempt = window.btoa(cleanInput);

    if (challenge.h.includes(encodedAttempt)) {
      ui.notifications.info("Access Granted.");
      await game.settings.set(SYSTEM_ID, SETTING_KEY, true);
      ui.sidebar.render(); 
    } else {
      ui.notifications.error("Access Denied.");
    }
  }
}
