const API_URL = "https://script.google.com/macros/s/AKfycbwz401Ii47fb86kB-eo93tirJmGpbHFS2jEonIn6yuFjNqu5rxjQiPvUTOzDkvAvoPR/exec";

const LOCATION_REQUIRED = true;

const params = new URLSearchParams(window.location.search);
const eventId = params.get("eventId");

let jobData = null;
let selectedWorker = null;
let clockInTime = null;
let timerInterval = null;

document.addEventListener("DOMContentLoaded", loadJob);

async function loadJob() {
  try {
    if (!eventId) {
      showError("Missing job link. No EventId found.");
      return;
    }

    const url = `${API_URL}?action=getWorkerJob&eventId=${encodeURIComponent(eventId)}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.success) {
      showError(json.error || "Could not load job.");
      return;
    }

    jobData = json.data;

    if (!jobData.workers || jobData.workers.length === 0) {
      showError("No workers assigned to this job.");
      return;
    }

    populateWorkerDropdown(jobData.workers);

    document.getElementById("loadingBox").classList.add("hidden");
    document.getElementById("loginBox").classList.remove("hidden");
  } catch (err) {
    showError("Error loading job: " + err.message);
  }
}

function populateWorkerDropdown(workers) {
  const select = document.getElementById("workerSelect");
  select.innerHTML = "";

  workers.forEach((worker) => {
    const option = document.createElement("option");
    option.value = worker.workerId;
    option.textContent = `${worker.workerName} - ${worker.workerId}`;
    select.appendChild(option);
  });
}

function continueToJob() {
  const workerId = document.getElementById("workerSelect").value;
  const pin = document.getElementById("pinInput").value.trim();

  if (!workerId) {
    showError("Please select your name.");
    return;
  }

  if (!pin) {
    showError("Please enter your PIN.");
    return;
  }

  selectedWorker = jobData.workers.find((w) => w.workerId === workerId);

  renderJobPage();

  document.getElementById("errorBox").classList.add("hidden");
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("jobBox").classList.remove("hidden");
}

function renderJobPage() {
  document.getElementById("clientName").textContent = jobData.clientName || "Job";
  document.getElementById("jobDate").textContent = `${jobData.date || ""} ${jobData.requestedTime || ""}`;
  document.getElementById("jobAddress").textContent = jobData.address || "";

  document.getElementById("selectedWorkerInfo").textContent =
    `${selectedWorker.workerName} (${selectedWorker.workerId}) — ${selectedWorker.role || ""} — $${selectedWorker.rate || ""}/hr`;

  document.getElementById("assignedTime").textContent =
    selectedWorker.assignedTime || jobData.assignedTime || "";

  document.getElementById("serviceType").textContent = jobData.serviceType || "";
  document.getElementById("entrance").textContent = jobData.entrance || "";
  document.getElementById("materialInfo").textContent = jobData.materialInfo || "";
  document.getElementById("instructions").textContent = jobData.instructions || "";
  document.getElementById("otherInfo").textContent = jobData.otherInfo || "";
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported on this device/browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          status: "CAPTURED",
          error: ""
        });
      },
      (error) => {
        reject(new Error(error.message || "Location permission denied."));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

async function getLocationForClockAction(actionName) {
  showMessage(`Requesting location for ${actionName}...`, "success");

  try {
    return await getCurrentLocation();
  } catch (err) {
    if (LOCATION_REQUIRED) {
      showMessage(
        `Location is required to ${actionName}. Please allow location access and try again.`,
        "error"
      );
      return null;
    }

    return {
      latitude: "",
      longitude: "",
      accuracy: "",
      capturedAt: new Date().toISOString(),
      status: "FAILED",
      error: err.message || "Location capture failed"
    };
  }
}

async function clockIn() {
  try {
    const location = await getLocationForClockAction("clock in");
    if (!location) return;

    const payload = {
      action: "clockIn",
      eventId: eventId,
      workerId: selectedWorker.workerId,
      location: location
    };

    const json = await postToApi(payload);

    if (!json.success) {
      showMessage(json.error || "Could not clock in.", "error");
      return;
    }

    clockInTime = new Date(json.clockInTime);

    document.getElementById("clockInBtn").classList.add("hidden");
    document.getElementById("clockOutBtn").classList.remove("hidden");
    document.getElementById("timerBox").classList.remove("hidden");

    startTimer();
    showMessage("Clocked in successfully. Location captured.", "success");
  } catch (err) {
    showMessage("Clock-in error: " + err.message, "error");
  }
}

async function clockOut() {
  try {
    const location = await getLocationForClockAction("clock out");
    if (!location) return;

    const payload = {
      action: "clockOut",
      workerId: selectedWorker.workerId,
      location: location
    };

    const json = await postToApi(payload);

    if (!json.success) {
      showMessage(json.error || "Could not clock out.", "error");
      return;
    }

    stopTimer();

    document.getElementById("clockOutBtn").classList.add("hidden");
    document.getElementById("clockInBtn").classList.remove("hidden");
    document.getElementById("timerBox").classList.add("hidden");

    showMessage(
      `Clocked out successfully. Total minutes: ${json.totalMinutes}. Location captured.`,
      "success"
    );
  } catch (err) {
    showMessage("Clock-out error: " + err.message, "error");
  }
}

async function postToApi(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return await res.json();
}

function startTimer() {
  stopTimer();

  timerInterval = setInterval(() => {
    const now = new Date();
    const diff = Math.floor((now - clockInTime) / 1000);

    const hours = String(Math.floor(diff / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((diff % 3600) / 60).padStart(2, "0"));
    const seconds = String(diff % 60).padStart(2, "0");

    document.getElementById("timer").textContent = `${hours}:${minutes}:${seconds}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function showError(message) {
  document.getElementById("loadingBox").classList.add("hidden");
  const box = document.getElementById("errorBox");
  box.textContent = message;
  box.classList.remove("hidden");
}

function showMessage(message, type) {
  const box = document.getElementById("messageBox");
  box.textContent = message;
  box.classList.remove("hidden");

  box.classList.remove("success", "error");
  box.classList.add(type === "success" ? "success" : "error");
}
