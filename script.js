(() => {
  const API_URL = 'https://mental-health-score-prediction-app.onrender.com';

  const form = document.getElementById('predictForm');
  const steps = Array.from(document.querySelectorAll('.step'));
  const dots = Array.from(document.querySelectorAll('.dot'));
  const brandSteps = Array.from(document.querySelectorAll('.brand__step'));

  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const submitBtn = document.getElementById('submitBtn');

  const toastStack = document.getElementById('toastStack');
  const loadingOverlay = document.getElementById('loadingOverlay');

  const resultPanel = document.getElementById('resultPanel');
  const resultScrim = document.getElementById('resultScrim');
  const resultClose = document.getElementById('resultClose');
  const retakeBtn = document.getElementById('retakeBtn');
  const gaugeFill = document.getElementById('gaugeFill');
  const scoreValue = document.getElementById('scoreValue');
  const resultTier = document.getElementById('resultTier');
  const resultDesc = document.getElementById('resultDesc');

  let currentStep = 0;

  // ---------- FIELD DEFINITIONS PER STEP ----------
  const stepFields = [
    ['age', 'gender', 'country', 'academic_level'],
    ['most_used_platform', 'purpose_of_use', 'avg_daily_usage_hours', 'daily_unlocks'],
    ['study_hours', 'physical_activity_hours', 'sleep_hours_per_night', 'stress_level'],
  ];

  const numericRules = {
    age: { min: 10, max: 100, label: 'Age' },
    avg_daily_usage_hours: { min: 0, max: 24, label: 'Avg. daily usage hours' },
    daily_unlocks: { min: 0, max: null, label: 'Daily phone unlocks' },
    study_hours: { min: 0, max: 24, label: 'Study hours' },
    physical_activity_hours: { min: 0, max: 24, label: 'Physical activity hours' },
    sleep_hours_per_night: { min: 0, max: 24, label: 'Sleep hours per night' },
  };

  // ---------- TOASTS ----------
  function showToast(message, kind = 'error') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${kind === 'info' ? 'info' : 'error'}`;
    toast.textContent = message;
    toastStack.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 4200);
  }

  // ---------- VALIDATION ----------
  function markInvalid(el, invalid) {
    el.classList.toggle('is-invalid', invalid);
  }

  function validateStep(stepIndex) {
    const fields = stepFields[stepIndex];
    let valid = true;
    const errors = [];

    fields.forEach((name) => {
      const el = form.elements[name];
      if (!el) return;
      markInvalid(el, false);

      const value = el.value.trim();
      if (value === '') {
        markInvalid(el, true);
        errors.push(`Please fill in "${el.previousElementSibling?.textContent || name}".`);
        valid = false;
        return;
      }

      if (numericRules[name]) {
        const num = Number(value);
        const rule = numericRules[name];
        if (Number.isNaN(num)) {
          markInvalid(el, true);
          errors.push(`${rule.label} must be a number.`);
          valid = false;
        } else if (num < rule.min || (rule.max !== null && num > rule.max)) {
          markInvalid(el, true);
          const range = rule.max !== null ? `between ${rule.min} and ${rule.max}` : `at least ${rule.min}`;
          errors.push(`${rule.label} must be ${range}.`);
          valid = false;
        }
      }
    });

    if (!valid) {
      // Show at most 2 toasts at a time so the stack stays readable
      errors.slice(0, 2).forEach((msg) => showToast(msg));
    }
    return valid;
  }

  // ---------- STEP NAVIGATION ----------
  function renderStep() {
    steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.step) === currentStep));
    dots.forEach((d) => {
      const i = Number(d.dataset.dot);
      d.classList.toggle('is-active', i === currentStep);
      d.classList.toggle('is-done', i < currentStep);
    });
    brandSteps.forEach((b) => {
      const i = Number(b.dataset.step);
      b.classList.toggle('is-active', i === currentStep);
      b.classList.toggle('is-done', i < currentStep);
    });

    backBtn.classList.toggle('is-hidden', currentStep === 0);
    const isLast = currentStep === steps.length - 1;
    nextBtn.classList.toggle('is-hidden', isLast);
    submitBtn.classList.toggle('is-hidden', !isLast);
  }

  nextBtn.addEventListener('click', () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < steps.length - 1) {
      currentStep += 1;
      renderStep();
    }
  });

  backBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep -= 1;
      renderStep();
    }
  });

  // ---------- BUILD PAYLOAD ----------
  function buildPayload() {
    const data = new FormData(form);
    return {
      age: parseInt(data.get('age'), 10),
      gender: data.get('gender'),
      country: data.get('country').trim(),
      academic_level: data.get('academic_level'),
      most_used_platform: data.get('most_used_platform'),
      purpose_of_use: data.get('purpose_of_use'),
      avg_daily_usage_hours: parseFloat(data.get('avg_daily_usage_hours')),
      daily_unlocks: parseInt(data.get('daily_unlocks'), 10),
      study_hours: parseFloat(data.get('study_hours')),
      physical_activity_hours: parseFloat(data.get('physical_activity_hours')),
      sleep_hours_per_night: parseFloat(data.get('sleep_hours_per_night')),
      stress_level: data.get('stress_level'),
    };
  }

  // ---------- RESULT RENDERING ----------
  const GAUGE_CIRCUMFERENCE = 251; // matches the SVG arc's path length approximation
  const GAUGE_MAX = 10;

  function tierFor(score) {
    if (score <= 3) {
      return {
        tier: 'Feeling steady',
        color: 'var(--sage)',
        desc: 'The model reads this pattern of habits as low strain. Keep an eye on what\u2019s working and keep it up.',
      };
    }
    if (score <= 6.5) {
      return {
        tier: 'Some strain showing',
        color: 'var(--amber)',
        desc: 'A mix of signals here — sleep, screen time or stress could be pulling in different directions. Worth a closer look.',
      };
    }
    return {
      tier: 'Under real pressure',
      color: 'var(--coral)',
      desc: 'This combination of habits reads as high strain in the model. Consider talking to someone you trust or a counselor.',
    };
  }

  function showResult(score) {
    const clamped = Math.max(0, Math.min(GAUGE_MAX, score));
    const ratio = clamped / GAUGE_MAX;
    const { tier, color, desc } = tierFor(clamped);

    scoreValue.textContent = Number.isInteger(score) ? score : score.toFixed(1);
    resultTier.textContent = tier;
    resultDesc.textContent = desc;
    gaugeFill.style.stroke = color;

    resultPanel.classList.remove('is-visible');
    // force reflow so the transition + dash animation replay each time
    void resultPanel.offsetWidth;
    gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE);

    resultPanel.classList.add('is-visible');
    resultPanel.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - ratio));
      });
    });
  }

  function closeResult() {
    resultPanel.classList.remove('is-visible');
    resultPanel.setAttribute('aria-hidden', 'true');
  }

  resultClose.addEventListener('click', closeResult);
  resultScrim.addEventListener('click', closeResult);
  retakeBtn.addEventListener('click', () => {
    closeResult();
  });

  // ---------- SUBMIT ----------
  function setLoading(isLoading) {
    loadingOverlay.classList.toggle('is-visible', isLoading);
    loadingOverlay.setAttribute('aria-hidden', String(!isLoading));
    submitBtn.disabled = isLoading;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateStep(currentStep)) return;

    const payload = buildPayload();
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        await handleApiError(response);
        return;
      }

      const result = await response.json();
      const score = Number(result.predicted_mental_health_score);

      if (Number.isNaN(score)) {
        showToast('The server returned an unexpected response. Please try again.');
        return;
      }

      showResult(score);
    } catch (err) {
      showToast('Could not reach the prediction server. Is it running on 127.0.0.1:8000?');
    } finally {
      setLoading(false);
    }
  }

  async function handleApiError(response) {
    if (response.status === 422) {
      try {
        const body = await response.json();
        const details = Array.isArray(body.detail) ? body.detail : [];
        if (details.length) {
          details.slice(0, 3).forEach((d) => {
            const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : 'field';
            showToast(`${field}: ${d.msg}`);
          });
          return;
        }
      } catch (_) {
        // fall through to generic message
      }
      showToast('Some answers look invalid. Please review the form.');
      return;
    }

    showToast(`Prediction failed (status ${response.status}). Please try again.`);
  }

  form.addEventListener('submit', handleSubmit);

  // ---------- INIT ----------
  renderStep();
})();