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
	const currentValueContainer = document.querySelector('.tbr-current-value');
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

	getCurrentVolume().then(vol => updateUI(vol)).catch(() => updateUI(100));
	populateAudibleTabsList();
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
	const currentValueContainer = document.querySelector('.tbr-current-value');
	
	slider.value = volume;
	currentValueContainer.textContent = `${volume}%`;
	
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


async function populateAudibleTabsList() {
	const listContainer = document.querySelector('.tbr-audible-tabs-list')
	if (!listContainer) return

	listContainer.innerHTML = ''

	try {
		const tabs = await currentBrowser.tabs.query({currentWindow: true})
		const audibleTabs = tabs.filter(tab => tab.audible)

		if (audibleTabs.length === 0) {
			const emptyItem = document.createElement('div')
			emptyItem.textContent = currentBrowser.i18n.getMessage('noAudibleTabs')
			emptyItem.classList.add('tbr-audible-tab-empty')
			listContainer.appendChild(emptyItem)
			return
		}

		audibleTabs.forEach(async tab => {
			const tabItem = document.createElement('div')
			tabItem.classList.add('tbr-audible-tab')

			const favIcon = document.createElement('img')
			favIcon.src = tab.favIconUrl || 'icons/default-16.png'
			favIcon.classList.add('tbr-tab-icon')
			favIcon.width = 16
			favIcon.height = 16

			const title = document.createElement('span')
			title.textContent = tab.title || 'Untitled'
			title.classList.add('tbr-tab-title')

			const volumeLabel = document.createElement('span')
			volumeLabel.classList.add('tbr-tab-volume')
			volumeLabel.textContent = '…'

			tabItem.appendChild(favIcon)
			tabItem.appendChild(title)
			tabItem.appendChild(volumeLabel)

			try {
				const results = await currentBrowser.scripting.executeScript({
					target: {tabId: tab.id},
					func: () => window.gainNode ? window.gainNode.gain.value : null
				})
				const gain = results?.[0]?.result
				if (gain != null) {
					volumeLabel.textContent = `${Math.round(gain * 100)}%`
				} else {
					volumeLabel.textContent = '100%'
				}
			} catch {
				volumeLabel.textContent = '100%'
			}

			const volumeValue = parseInt(volumeLabel.textContent)

			volumeLabel.style.backgroundColor = getVolumeColor(volumeValue)
			volumeLabel.style.color = (volumeValue >= 300 || volumeValue <= 200) ? '#fff' : '#333'

			tabItem.addEventListener('click', () => {
				currentBrowser.tabs.update(tab.id, {active: true})
				currentBrowser.windows.update(tab.windowId, {focused: true})
			})

			listContainer.appendChild(tabItem)
		})

	} catch (e) {
		console.error('Error fetching audible tabs:', e)
	}
}
