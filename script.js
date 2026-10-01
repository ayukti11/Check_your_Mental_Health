(() => {
  "use strict";

  // API configuration
  const API_URL = "https://check-your-mental-health.onrender.com";

  const form = document.getElementById("predict-form");
  const formView = document.getElementById("form-view");
  const resultView = document.getElementById("result-view");
  const resultCard = document.getElementById("result-card");
  const submitButton = document.getElementById("submit-button");
  const resetButton = document.getElementById("reset-button");
  const toast = document.getElementById("toast");
  const universeCanvas = document.getElementById("universe");
  const confettiCanvas = document.getElementById("confetti-canvas");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let toastTimer;
  let stars = [];
  let shootingStars = [];
  let animationFrame = null;
  let confettiFrame = null;
  let confettiParticles = [];
  let lastConfettiTime = 0;
  let pointer = { x: 0, y: 0 };

  // Update the displayed value and filled track for each range slider.
  function updateRange(input) {
    const output = document.getElementById(`${input.id}-output`);
    const value = Number(input.value);
    const formatted = Number.isInteger(value) ? value : value.toFixed(1);

    if (output) {
      output.textContent = `${formatted} ${value === 1 ? "hr" : "hrs"}`;
    }

    const min = Number(input.min);
    const max = Number(input.max);
    const percent = ((value - min) / (max - min)) * 100;

    input.style.background =
      `linear-gradient(90deg, #9174ff 0%, #42cfe1 ${percent}%, rgba(255,255,255,.13) ${percent}%)`;
  }

  document.querySelectorAll('input[type="range"]').forEach((input) => {
    updateRange(input);
    input.addEventListener("input", () => updateRange(input));
  });

  // Display an inline error message for a form field.
  function setFieldError(name, message) {
    const error = document.getElementById(`${name}-error`);
    if (error) error.textContent = message;

    const control = form.elements.namedItem(name);

    // Radio groups return a collection, so use the first radio as the field element.
    const element = control instanceof Element ? control : control?.[0];
    const field = element?.closest(".field");

    if (field) {
      field.classList.toggle("invalid", Boolean(message));
    }

    // Set aria-invalid on regular inputs and selects, not on a radio group.
    if (element && element.type !== "radio") {
      if (message) {
        element.setAttribute("aria-invalid", "true");
      } else {
        element.removeAttribute("aria-invalid");
      }
    }
  }

  // Validate the form before sending data to the API.
  function validateForm() {
    let valid = true;

    const requiredFields = [
      "age",
      "gender",
      "country",
      "academic_level",
      "most_used_platform",
      "purpose_of_use",
      "daily_unlocks",
      "stress_level"
    ];

    requiredFields.forEach((name) => setFieldError(name, ""));

    requiredFields.forEach((name) => {
      const control = form.elements.namedItem(name);

      const value = name === "stress_level"
        ? form.querySelector('input[name="stress_level"]:checked')?.value
        : control.value.trim();

      if (!value) {
        const message = name === "stress_level"
          ? "Please choose a stress level."
          : "This field is required.";

        setFieldError(name, message);
        valid = false;
      }
    });

    const age = Number(form.elements.age.value);

    if (
      form.elements.age.value &&
      (!Number.isInteger(age) || age < 10 || age > 100)
    ) {
      setFieldError("age", "Enter a whole number from 10 to 100.");
      valid = false;
    }

    const unlocks = Number(form.elements.daily_unlocks.value);

    if (
      form.elements.daily_unlocks.value &&
      (!Number.isInteger(unlocks) || unlocks < 0)
    ) {
      setFieldError("daily_unlocks", "Enter a whole number of 0 or more.");
      valid = false;
    }

    const rangeFields = [
      "avg_daily_usage_hours",
      "study_hours",
      "physical_activity_hours",
      "sleep_hours_per_night"
    ];

    rangeFields.forEach((name) => {
      const value = Number(form.elements[name].value);

      if (!Number.isFinite(value) || value < 0 || value > 24) {
        setFieldError(name, "Enter a value from 0 to 24.");
        valid = false;
      } else {
        setFieldError(name, "");
      }
    });

    if (!valid) {
      const firstInvalid =
        form.querySelector('[aria-invalid="true"]') ||
        form.querySelector(".field.invalid input, .field.invalid select") ||
        form.querySelector(".stress-pill input");

      firstInvalid?.focus();
    }

    return valid;
  }

  // Build the request body using the exact API field names and numeric types.
  function buildPayload() {
    return {
      age: Number(form.elements.age.value),
      gender: form.elements.gender.value,
      country: form.elements.country.value.trim(),
      academic_level: form.elements.academic_level.value,
      most_used_platform: form.elements.most_used_platform.value,
      purpose_of_use: form.elements.purpose_of_use.value,
      avg_daily_usage_hours: Number(
        form.elements.avg_daily_usage_hours.value
      ),
      daily_unlocks: Number(form.elements.daily_unlocks.value),
      study_hours: Number(form.elements.study_hours.value),
      physical_activity_hours: Number(
        form.elements.physical_activity_hours.value
      ),
      sleep_hours_per_night: Number(
        form.elements.sleep_hours_per_night.value
      ),
      stress_level: form.querySelector(
        'input[name="stress_level"]:checked'
      ).value
    };
  }

  // Show an error toast/banner.
  function showError(message) {
    toast.textContent = message;
    toast.classList.add("visible");

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("visible");
    }, 6500);
  }

  // Convert FastAPI validation details into a readable message.
  function formatApiErrors(details) {
    if (!Array.isArray(details) || details.length === 0) {
      return "Some information needs checking. Please review your answers and try again.";
    }

    const messages = details.map((item) => {
      const field = Array.isArray(item.loc)
        ? item.loc[item.loc.length - 1]
        : "";

      const friendlyField = String(field || "answer").replaceAll("_", " ");
      return `${friendlyField}: ${item.msg || "please check this value"}`;
    });

    return `Please check your answers — ${messages.join("; ")}.`;
  }

  // Send the prediction request, with a 15-second timeout.
  async function predictScore(payload) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${API_URL}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 422) {
        throw new Error(formatApiErrors(data.detail));
      }

      if (!response.ok) {
        throw new Error(
          data.detail ||
          `The server returned an error (${response.status}). Please try again.`
        );
      }

      if (typeof data.predicted_mental_health_score !== "number") {
        throw new Error(
          "The server response did not include a valid prediction. Please try again."
        );
      }

      const score = Math.max(
        0,
        Math.min(10, Math.round(data.predicted_mental_health_score))
      );

      showResult(score);
    } catch (error) {
      if (error.name === "AbortError") {
        showError(
          "The request took too long. Please check your connection and try again."
        );
      } else if (error instanceof TypeError) {
        showError(
          `Could not connect to the prediction server. Make sure the API is running at ${API_URL} and that CORS is enabled.`
        );
      } else {
        showError(error.message || "Something went wrong. Please try again.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  // Toggle the submit button's loading state.
  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    resetButton.disabled = isLoading;
    submitButton.classList.toggle("is-loading", isLoading);
    submitButton.setAttribute("aria-busy", String(isLoading));

    submitButton.querySelector(".button-text").textContent = isLoading
      ? "Finding your orbit…"
      : "Predict My Score ✨";
  }

  // Form submission.
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    toast.classList.remove("visible");

    if (!validateForm()) {
      showError("Please check the highlighted fields before continuing.");
      return;
    }

    setLoading(true);
    await predictScore(buildPayload());
  });

  // Result content for scores from 0 to 3.
  function renderMotivationCard() {
    return `
      <p class="result-kicker">MOTIVATION CARD · YOUR NEXT CHAPTER</p>
      <span class="result-emoji" aria-hidden="true">💪</span>
      <h2>Every Journey Starts With One Step 🌱</h2>
      <p class="result-message">
        Your score is just one snapshot—not the whole story. Small, caring
        changes can make a difference, and you don’t have to figure it all out
        alone.
      </p>
      <ul class="tips-list">
        <li><i class="fa-solid fa-moon" aria-hidden="true"></i> Aim for a steady 7–8 hours of sleep.</li>
        <li><i class="fa-solid fa-person-walking" aria-hidden="true"></i> Try a gentle 20-minute walk outdoors.</li>
        <li><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i> Give yourself a screen break each day.</li>
        <li><i class="fa-solid fa-comments" aria-hidden="true"></i> Reach out and talk with someone you trust.</li>
        <li><i class="fa-solid fa-wind" aria-hidden="true"></i> Pause for a few slow, mindful breaths.</li>
      </ul>
      <p class="gentle-note">
        If you're feeling overwhelmed, consider reaching out to a mental health
        professional or someone you trust.
      </p>
      <div class="result-actions">
        <button class="button button-primary predict-again" type="button">
          Predict Again
        </button>
      </div>`;
  }

  // Result content for scores from 4 to 7.
  function renderKeepGoingCard() {
    return `
      <p class="result-kicker">KEEP GOING CARD · FIND YOUR BALANCE</p>
      <span class="result-emoji" aria-hidden="true">😊</span>
      <h2>You're Doing Great – Keep It Up! 🌿</h2>
      <p class="result-message">
        You’re building a steady foundation. Keep noticing what helps you feel
        balanced, and give yourself credit for the healthy choices you’re making.
      </p>
      <ul class="tips-list">
        <li><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Keep a consistent daily routine.</li>
        <li><i class="fa-solid fa-palette" aria-hidden="true"></i> Make time for hobbies that recharge you.</li>
        <li><i class="fa-solid fa-mobile-screen" aria-hidden="true"></i> Take mindful breaks from scrolling.</li>
        <li><i class="fa-solid fa-person-running" aria-hidden="true"></i> Stay active in a way you enjoy.</li>
      </ul>
      <p class="gentle-note">
        Wellness is personal and can change over time. Keep checking in with
        yourself and celebrate your progress.
      </p>
      <div class="result-actions">
        <button class="button button-primary predict-again" type="button">
          Predict Again
        </button>
      </div>`;
  }

  // Result content for scores from 8 to 10.
  function renderCelebrationCard() {
    return `
      <p class="result-kicker">WOWWW CELEBRATION CARD · YOU'RE SHINING</p>
      <span class="result-emoji" aria-hidden="true">🏆</span>
      <h2>WOOHOO! You're Absolutely Glowing! 🌟</h2>
      <p class="result-message">
        Look at you go! Your result reflects some wonderfully positive habits.
        Take a moment to feel proud of the care and intention you’re bringing to
        your wellbeing.
      </p>
      <ul class="tips-list">
        <li><i class="fa-solid fa-star" aria-hidden="true"></i> Keep nurturing the habits that feel good.</li>
        <li><i class="fa-solid fa-heart" aria-hidden="true"></i> Make space for rest and meaningful connection.</li>
        <li><i class="fa-solid fa-seedling" aria-hidden="true"></i> Keep growing at your own pace.</li>
        <li><i class="fa-solid fa-face-smile" aria-hidden="true"></i> Share your good energy—and enjoy it!</li>
      </ul>
      <p class="gentle-note">
        Every person’s experience is unique. Keep listening to yourself, even
        when things are going well.
      </p>
      <div class="result-actions">
        <button class="button button-primary" id="celebrate-again" type="button">
          Celebrate Again 🎊
        </button>
        <button class="button button-quiet predict-again" type="button">
          Predict Again
        </button>
      </div>`;
  }

  // Display the correct result card and animate its score.
  function showResult(score) {
    formView.hidden = true;
    resultView.hidden = false;

    let theme;
    let content;

    if (score <= 3) {
      theme = "motivation";
      content = renderMotivationCard();
    } else if (score <= 7) {
      theme = "keep-going";
      content = renderKeepGoingCard();
    } else {
      theme = "celebration";
      content = renderCelebrationCard();
    }

    resultCard.className = `glass-card result-card ${theme}`;
    resultCard.innerHTML = `
      <div class="score-layout">
        <div class="score-ring" role="img" aria-label="Mental wellness score: ${score} out of 10">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="ring-track" cx="60" cy="60" r="54"></circle>
            <circle class="ring-progress" cx="60" cy="60" r="54"></circle>
          </svg>
          <div class="score-number">
            <span id="score-counter">0</span>
            <small>OUT OF 10</small>
          </div>
        </div>
        <div class="score-summary">
          <strong>Your wellness snapshot</strong>
          A moment to reflect, learn, and keep moving forward.
        </div>
      </div>
      ${content}`;

    animateScore(score);
    resultView.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center"
    });

    resultCard.querySelectorAll(".predict-again").forEach((button) => {
      button.addEventListener("click", resetForm);
    });

    const celebrateButton = document.getElementById("celebrate-again");
    celebrateButton?.addEventListener("click", () => launchConfetti(true));

    if (score >= 8) {
      launchConfetti(false);
    }
  }

  // Count the score up and animate the circular progress ring.
  function animateScore(score) {
    const counter = document.getElementById("score-counter");
    const ring = resultCard.querySelector(".ring-progress");
    const circumference = 2 * Math.PI * 54;

    ring.style.strokeDasharray = String(circumference);
    ring.style.strokeDashoffset = String(circumference);

    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = String(
        circumference * (1 - score / 10)
      );
    });

    if (reducedMotion) {
      counter.textContent = String(score);
      return;
    }

    const duration = 1100;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      counter.textContent = String(Math.round(score * eased));

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  // Reset the questionnaire and return from the result card.
  function resetForm() {
    form.reset();

    document.querySelectorAll(".field-error").forEach((error) => {
      error.textContent = "";
    });

    document.querySelectorAll(".field.invalid").forEach((field) => {
      field.classList.remove("invalid");
    });

    document
      .querySelectorAll('input[aria-invalid="true"], select[aria-invalid="true"]')
      .forEach((control) => control.removeAttribute("aria-invalid"));

    document.querySelectorAll('input[type="range"]').forEach(updateRange);

    resultView.hidden = true;
    formView.hidden = false;
    toast.classList.remove("visible");

    formView.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start"
    });
  }

  resetButton.addEventListener("click", () => {
    window.setTimeout(() => {
      document.querySelectorAll('input[type="range"]').forEach(updateRange);

      document.querySelectorAll(".field-error").forEach((error) => {
        error.textContent = "";
      });

      document.querySelectorAll(".field.invalid").forEach((field) => {
        field.classList.remove("invalid");
      });
    }, 0);
  });

  // Universe canvas: orbiting stars, parallax, and occasional shooting stars.
  const universeContext = universeCanvas.getContext("2d");

  function initStars() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const count = Math.min(
      420,
      Math.max(150, Math.floor((width * height) / 4300))
    );

    stars = Array.from({ length: count }, () => {
      const layer = Math.random();

      return {
        angle: Math.random() * Math.PI * 2,
        radius: Math.sqrt(Math.random()) * Math.max(width, height) * 0.75,
        speed:
          (Math.random() * 0.000045 + 0.000008) *
          (layer < 0.33 ? 1.7 : layer < 0.7 ? 1 : 0.55) *
          (Math.random() < 0.5 ? -1 : 1),
        size: Math.random() * 1.5 + 0.25,
        alpha: Math.random() * 0.65 + 0.2,
        phase: Math.random() * Math.PI * 2,
        layer
      };
    });
  }

  function resizeCanvas(canvas, context) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function createShootingStar() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    shootingStars.push({
      x: Math.random() * width * 0.8,
      y: Math.random() * height * 0.4,
      vx: 7 + Math.random() * 5,
      vy: 3 + Math.random() * 3,
      life: 1,
      length: 90 + Math.random() * 100
    });
  }

  function animateStars(time = 0) {
    const ctx = universeContext;
    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2 + pointer.x * 18;
    const centerY = height / 2 + pointer.y * 18;

    // Draw a soft nebula haze.
    const haze = ctx.createRadialGradient(
      centerX - width * 0.2,
      centerY - height * 0.23,
      0,
      centerX - width * 0.2,
      centerY - height * 0.23,
      Math.max(width, height) * 0.7
    );

    haze.addColorStop(0, "rgba(103, 61, 173, 0.09)");
    haze.addColorStop(0.48, "rgba(47, 53, 119, 0.035)");
    haze.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);

    stars.forEach((star) => {
      if (!reducedMotion) {
        star.angle += star.speed * 16;
      }

      const parallax = (star.layer - 0.5) * 23;
      const x =
        centerX +
        Math.cos(star.angle) * star.radius +
        pointer.x * parallax;
      const y =
        centerY +
        Math.sin(star.angle) * star.radius * 0.67 +
        pointer.y * parallax;

      const twinkle = reducedMotion
        ? 1
        : 0.7 + Math.sin(time * 0.0012 + star.phase) * 0.3;

      ctx.beginPath();
      ctx.fillStyle = `rgba(220, 226, 255, ${star.alpha * twinkle})`;
      ctx.arc(x, y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    if (!reducedMotion && Math.random() < 0.006) {
      createShootingStar();
    }

    shootingStars = shootingStars.filter((shot) => shot.life > 0);

    shootingStars.forEach((shot) => {
      const gradient = ctx.createLinearGradient(
        shot.x,
        shot.y,
        shot.x - shot.vx * 9,
        shot.y - shot.vy * 9
      );

      gradient.addColorStop(0, `rgba(255,255,255,${shot.life})`);
      gradient.addColorStop(1, "rgba(145,130,255,0)");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(shot.x, shot.y);
      ctx.lineTo(
        shot.x - shot.vx * shot.length / 10,
        shot.y - shot.vy * shot.length / 10
      );
      ctx.stroke();

      shot.x += shot.vx;
      shot.y += shot.vy;
      shot.life -= 0.012;
    });

    if (!reducedMotion) {
      animationFrame = requestAnimationFrame(animateStars);
    }
  }

  function startUniverse() {
    resizeCanvas(universeCanvas, universeContext);
    initStars();

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }

    animateStars();
  }

  window.addEventListener("resize", startUniverse);

  window.addEventListener(
    "pointermove",
    (event) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (confettiFrame) cancelAnimationFrame(confettiFrame);

      animationFrame = null;
      confettiFrame = null;
    } else {
      startUniverse();

      if (confettiParticles.length) {
        animateConfetti();
      }
    }
  });

  // Custom confetti canvas for celebration results.
  const confettiContext = confettiCanvas.getContext("2d");

  function resizeConfettiCanvas() {
    resizeCanvas(confettiCanvas, confettiContext);
  }

  function launchConfetti(retrigger = false) {
    resizeConfettiCanvas();

    if (retrigger) {
      confettiParticles = [];
    }

    const colors = [
      "#ffd166",
      "#ff70b8",
      "#8c70ff",
      "#50d9ed",
      "#67e6b7",
      "#ffffff"
    ];

    const burstCount = 170;

    for (let index = 0; index < burstCount; index += 1) {
      confettiParticles.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * window.innerHeight * 0.7,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 1.4 + Math.random() * 4,
        size: 3 + Math.random() * 5,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.16,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: Math.random() > 0.25 ? "rect" : "star",
        life: 1
      });
    }

    lastConfettiTime = performance.now();
    animateConfetti();
  }

  function animateConfetti(now = performance.now()) {
    if (document.hidden) return;

    if (confettiFrame) {
      cancelAnimationFrame(confettiFrame);
    }

    const elapsed = now - lastConfettiTime;
    const ctx = confettiContext;
    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);

    confettiParticles = confettiParticles.filter(
      (particle) => particle.y < height + 30 && particle.life > 0
    );

    confettiParticles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.025;
      particle.rotation += particle.rotationSpeed;
      particle.life -= 0.0018;

      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;

      if (particle.shape === "star") {
        ctx.font = `${particle.size * 2.2}px sans-serif`;
        ctx.fillText("✦", 0, 0);
      } else {
        ctx.fillRect(
          -particle.size / 2,
          -particle.size / 2,
          particle.size,
          particle.size * 1.7
        );
      }

      ctx.restore();
    });

    if (confettiParticles.length && elapsed < 7000) {
      confettiFrame = requestAnimationFrame(animateConfetti);
    } else {
      confettiParticles = [];
      ctx.clearRect(0, 0, width, height);
      confettiFrame = null;
    }
  }

  // Start the background animations.
  resizeConfettiCanvas();
  startUniverse();
})();