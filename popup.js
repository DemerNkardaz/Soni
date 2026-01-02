const currentBrowser = typeof browser === "undefined" ? chrome : browser;
const browserName = typeof browser === "undefined" ? "chrome" : "browser";
const currentLang = currentBrowser.i18n.getUILanguage().startsWith('ru') ? 'ru' : 'en';

const colorValues = {
	'safe': '#66ff00',
	'warning': '#ffe600',
	'caution': '#ff9500',
	'unsafe': '#de007e',
	'danger': '#cb0000'
}

const volumes = { min: 0, max: 500, step: 5 };

document.addEventListener('DOMContentLoaded', () => {
	const elementsToLocalize = document.querySelectorAll('[data-localeKey]');
	const slider = document.getElementById('vol-slider');
	const btnIncrease = document.getElementById('vol-plus');
	const btnDecrease = document.getElementById('vol-minus');
	const staticButtonWrapper = document.querySelector('.tbr-controls__static-values');
	const staticButtonValues = [0, 50, 100, 200, 300, 400, 500];

	elementsToLocalize.forEach(element => {
		const key = element.getAttribute('data-localeKey');
		const localizedText = currentBrowser.i18n.getMessage(key);
		element.textContent = localizedText;
	});

	console.log(`${currentLang}\n${browserName}`);
	
	btnDecrease.addEventListener('click', () => adjustVolume(-volumes.step));
	btnIncrease.addEventListener('click', () => adjustVolume(volumes.step));
	btnDecrease.textContent = `−${volumes.step}%`;
	btnIncrease.textContent = `+${volumes.step}%`;
	
	slider.addEventListener('input', () => setTabVolume(slider.value));
	slider.setAttribute('min', volumes.min);
	slider.setAttribute('max', volumes.max);
	slider.setAttribute('step', volumes.step);
	createSliderTicks();
	setSliderGradient(slider);

	staticButtonValues.forEach(value => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.textContent = `${value}%`;
		btn.addEventListener('click', () => setTabVolume(value));
		staticButtonWrapper.appendChild(btn);
	});

	getCurrentVolume().then(vol => slider.value = vol).catch(() => slider.value = 100);
});

function setSliderGradient(slider) {
	const thresholds = [200, 250, 300, 350, 500];

	let prev = 0;
	const gradientParts = thresholds.map(thresh => {
		const startPercent = (prev / 500) * 100;
		const endPercent = (thresh / 500) * 100;
		const color = getVolumeColor(thresh); // берем цвет из твоей функции
		prev = thresh;
		return `${color} ${startPercent}%, ${color} ${endPercent}%`;
	});

	slider.style.background = `linear-gradient(to right, ${gradientParts.join(', ')})`;
}

function createSliderTicks() {
	const slider = document.getElementById('vol-slider');
	const sliderContainer = slider.parentElement;

	let ticksContainer = sliderContainer.querySelector('.slider-ticks');
	if (!ticksContainer) {
		ticksContainer = document.createElement('div');
		ticksContainer.classList.add('slider-ticks');
		sliderContainer.appendChild(ticksContainer);
	}
	ticksContainer.innerHTML = '';

	const positions = [0, 50, 100, 200, 300, 400, 500];
	const max = parseFloat(slider.max);

	const sliderRect = slider.getBoundingClientRect();
	const trackPadding = 8;
	const trackWidth = sliderRect.width - trackPadding * 2;

	positions.forEach(pos => {
		const tick = document.createElement('span');
		tick.classList.add('tick');

		const leftPx = trackPadding + (pos / max) * trackWidth;
		tick.style.left = `${leftPx}px`;
		ticksContainer.appendChild(tick);
	});
}



function getVolumeColor(value) {
	return value <= 200 ? colorValues.safe
	: value <= 250 ? colorValues.warning
	: value <= 300 ? colorValues.caution
	: value <= 350 ? colorValues.unsafe
	: colorValues.danger;
}

function setTabVolume(volume) {
	const vol = clampVolumeValue(volume);
	currentBrowser.tabs.query({active: true, currentWindow: true}, (tabs) => {
		if (tabs[0]) {
			currentBrowser.scripting.executeScript({
				target: {tabId: tabs[0].id},
				func: applyVolumeBoost,
				args: [vol / 100]
			}).catch((error) => {
				console.error('Failed to apply volume:', error);
			});
		}
	});
	updateUI(vol);
}

function adjustVolume(delta) {
	getCurrentVolume().then(currentVolume => {
		const newVolume = clampVolumeValue(currentVolume + delta);
		setTabVolume(newVolume);
	}).catch(() => {
		setTabVolume(clampVolumeValue(volumes.min));
	});
}


function getCurrentVolume() {
	return new Promise((resolve, reject) => {
		currentBrowser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (!tabs[0]) {
				resolve(100);
				return;
			}
			currentBrowser.scripting.executeScript({
				target: { tabId: tabs[0].id },
				func: getVolumeBoost
			}).then((results) => {
				const vol = results?.[0]?.result != null ? Math.round(results[0].result * 100) : 100;
				resolve(vol);
			}).catch(() => {
				resolve(100);
			});
		});
	});
}


function updateUI(volume) {
	const slider = document.getElementById('vol-slider');

	slider.value = volume;
	
	currentBrowser.action.setBadgeText({ text: `${volume}` });
	currentBrowser.action.setBadgeBackgroundColor({ color: getVolumeColor(volume) });
}

function resetUI() {
	currentBrowser.action.setBadgeText({ text: '' });
}

function applyVolumeBoost(gain) {
	if (!window.audioContext) {
		window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
		window.gainNode = window.audioContext.createGain();
		
		const mediaElements = document.querySelectorAll('video, audio');
		mediaElements.forEach(media => {
			if (!media.dataset.boosted) {
				try {
					const source = window.audioContext.createMediaElementSource(media);
					source.connect(window.gainNode);
					window.gainNode.connect(window.audioContext.destination);
					media.dataset.boosted = 'true';
				} catch (e) {
					console.warn('Failed to boost media element:', e);
				}
			}
		});
	}
	
	if (window.gainNode) {
		window.gainNode.gain.value = gain;
	}
}

function getVolumeBoost() {
	return window.gainNode ? window.gainNode.gain.value : null;
}

function clampVolumeValue(value, min = volumes.min, max = volumes.max) {
	return Math.min(Math.max(value, min), max);
}