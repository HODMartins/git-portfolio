// script.js

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// Active navigation highlighting based on section visibility
const nav = document.querySelector(".navigation");
const indicator = document.querySelector(".nav-indicator");
const navLinks = document.querySelectorAll(".nav-link");

const sections = [...navLinks]
  .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
  .filter(Boolean);

function moveIndicatorToActive() {
  if (!nav || !indicator) return;

  const active = nav.querySelector(".nav-link.active");
  if (!active) {
    indicator.style.opacity = "0";
    return;
  }

  const navRect = nav.getBoundingClientRect();
  const aRect = active.getBoundingClientRect();
  const y = aRect.top - navRect.top;

  indicator.style.opacity = "1";
  indicator.style.height = `${aRect.height}px`;
  indicator.style.transform = `translateY(${y}px)`;
}

function setActive(id) {
  navLinks.forEach((a) =>
    a.classList.toggle("active", a.getAttribute("href") === `#${id}`)
  );
  moveIndicatorToActive();
}

function updateActiveByScroll() {
  const TOP_OFFSET = 140;

  let bestId = sections[0]?.id;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sec of sections) {
    const rect = sec.getBoundingClientRect();
    const distance = Math.abs(rect.top - TOP_OFFSET);

    if (rect.top <= TOP_OFFSET + 200 && distance < bestDistance) {
      bestDistance = distance;
      bestId = sec.id;
    }
  }

  if (bestId) setActive(bestId);
}

updateActiveByScroll();
window.addEventListener("scroll", updateActiveByScroll, { passive: true });
window.addEventListener("resize", () => {
  updateActiveByScroll();
  moveIndicatorToActive();
});

// Contact form submission (demo)
const contactForm = document.querySelector(".contact-form");
if (contactForm) {
  contactForm.addEventListener("submit", function (e) {
    e.preventDefault();
    alert("Thank you for your message! I will get back to you soon.");
    this.reset();
  });
}

/**
 * Generic carousel initializer (supports your top carousel + project carousel)
 */
function initCarousel(root, config) {
  const slides = root.querySelectorAll(config.slidesSelector);
  const prevBtn = root.querySelector(config.prevSelector);
  const nextBtn = root.querySelector(config.nextSelector);
  const dotsContainer = config.dotsContainerSelector
    ? root.querySelector(config.dotsContainerSelector)
    : null;

  let dots = config.dotSelector ? root.querySelectorAll(config.dotSelector) : [];
  const total = slides.length;

  if (!total) return;

  let current = 0;

  // If dots mismatch slides, rebuild dots (if container exists)
  if (dotsContainer && dots.length !== total) {
    dotsContainer.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const d = document.createElement("span");
      d.className = (config.dotClass || "dot") + (i === 0 ? " active" : "");
      d.setAttribute("data-slide", String(i));
      d.setAttribute("aria-label", `Go to slide ${i + 1}`);
      dotsContainer.appendChild(d);
    }
    dots = root.querySelectorAll(config.dotSelector);
  }

  function show(index) {
    slides.forEach((s) =>
      s.classList.remove(config.activeSlideClass || "active")
    );
    slides[index].classList.add(config.activeSlideClass || "active");

    if (dots && dots.length) {
      dots.forEach((d) =>
        d.classList.remove(config.activeDotClass || "active")
      );
      if (dots[index]) dots[index].classList.add(config.activeDotClass || "active");
    }
  }

  function next() {
    current = (current + 1) % total;
    show(current);
  }

  function prev() {
    current = (current - 1 + total) % total;
    show(current);
  }

  if (nextBtn) nextBtn.addEventListener("click", next);
  if (prevBtn) prevBtn.addEventListener("click", prev);

  if (dotsContainer) {
    dotsContainer.addEventListener("click", (e) => {
      const dot = e.target.closest(config.dotSelector);
      if (!dot) return;
      const idx = Number(dot.getAttribute("data-slide"));
      if (Number.isInteger(idx) && idx >= 0 && idx < total) {
        current = idx;
        show(current);
      }
    });
  }

  // Autoplay (optional)
  if (config.autoplayMs && Number.isFinite(config.autoplayMs)) {
    let timer = setInterval(next, config.autoplayMs);

    // Pause on hover (optional)
    if (config.pauseOnHover) {
      root.addEventListener("mouseenter", () => clearInterval(timer));
      root.addEventListener("mouseleave", () => {
        timer = setInterval(next, config.autoplayMs);
      });
    }
  }

  // initial
  show(current);
}

// Project carousels
document.querySelectorAll(".project-carousel").forEach((proj) => {
  initCarousel(proj, {
    slidesSelector: ".proj-slide",
    prevSelector: ".proj-btn.prev",
    nextSelector: ".proj-btn.next",
    dotsContainerSelector: ".proj-dots",
    dotSelector: ".proj-dot",
    dotClass: "proj-dot",
    activeSlideClass: "active",
    activeDotClass: "active",
    autoplayMs: 3500,
    pauseOnHover: true,
  });
});

/* =========================
   Global Kitchen RAG Chat
   ========================= */

// IMPORTANT: This must point to your deployed API domain
const API_BASE = "https://api.hodmartins.com";
const RAG_API_URL = `${API_BASE}/ask-stream`; // ✅ streaming endpoint

const ragChatForm = document.getElementById("ragChatForm");
const ragChatMessage = document.getElementById("ragChatMessage");
const ragChatBody = document.getElementById("ragChatBody");
const ragChatStatus = document.getElementById("ragChatStatus");
const ragClearBtn = document.querySelector(".rag-chat-clear");

function ragScrollToBottom() {
  if (!ragChatBody) return;
  ragChatBody.scrollTop = ragChatBody.scrollHeight;
}

function ragAddBubble(text, who, extraClass = "") {
  if (!ragChatBody) return null;
  const bubble = document.createElement("div");
  bubble.className =
    `rag-chat-bubble ${who}` + (extraClass ? ` ${extraClass}` : "");
  bubble.textContent = text;
  ragChatBody.appendChild(bubble);
  ragScrollToBottom();
  return bubble;
}

function setRagStatus(text) {
  if (!ragChatStatus) return;
  ragChatStatus.textContent = text || "";
}

/**
 * Robust SSE streaming fetch: updates UI as tokens arrive
 * Handles \r\n, partial chunks, and multiple data: lines per event.
 * @param {string} question
 * @param {(liveText: string) => void} onToken
 * @returns {Promise<string>} finalText
 */
async function askRagAgentStreaming(question, onToken) {
  const res = await fetch(RAG_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Request failed (${res.status}). ${errText}`);
  }

  if (!res.body) {
    const txt = await res.text();
    if (onToken) onToken(txt);
    return txt;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Normalize CRLF to LF for consistent parsing
    buffer = buffer.replace(/\r\n/g, "\n");

    // SSE events separated by blank line
    const events = buffer.split("\n\n");
    buffer = events.pop() || ""; // keep incomplete tail

    for (const evt of events) {
      const lines = evt.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        const token = line.replace(/^data:\s?/, "");

        if (token === "[DONE]") return fullText;

        if (token) {
          fullText += token;
          if (onToken) onToken(fullText);
          ragScrollToBottom();
        }
      }
    }
  }

  return fullText;
}

if (ragChatForm && ragChatMessage && ragChatBody) {
  ragChatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = ragChatMessage.value.trim();
    if (!text) return;

    ragAddBubble(text, "user");
    ragChatMessage.value = "";

    // This bubble becomes the live streaming bubble
    const loadingBubble = ragAddBubble("Fetching response...", "bot", "loading");
    setRagStatus("Fetching response from the agent...");

    ragChatMessage.disabled = true;
    const sendBtn = ragChatForm.querySelector("button[type='submit']");
    if (sendBtn) sendBtn.disabled = true;

    try {
      let finalText = "";

      finalText = await askRagAgentStreaming(text, (liveText) => {
        if (loadingBubble) loadingBubble.textContent = liveText || "";
      });

      if (loadingBubble) {
        loadingBubble.classList.remove("loading");
        loadingBubble.textContent =
          finalText || "I did not receive a response. Please try again.";
      }

      setRagStatus("");
    } catch (err) {
      if (loadingBubble) loadingBubble.remove();

      ragAddBubble(
        "I could not reach the agent endpoint. Please confirm the endpoint URL and that it allows requests from this website.",
        "bot"
      );

      setRagStatus(
        "Network error. If your backend is on a different domain, you may need cross origin request settings."
      );
      console.error(err);
    } finally {
      ragChatMessage.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      ragChatMessage.focus();
      ragScrollToBottom();
    }
  });
}

if (ragClearBtn && ragChatBody) {
  ragClearBtn.addEventListener("click", () => {
    ragChatBody.innerHTML = "";
    ragAddBubble(
      "Hi! Ask me a question about Global Kitchen Restaurant (for example: “What is on the menu?”).",
      "bot"
    );
    setRagStatus("");
    if (ragChatMessage) ragChatMessage.focus();
  });
}
