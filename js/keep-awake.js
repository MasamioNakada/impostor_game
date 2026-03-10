(function() {
    'use strict';

    let wakeLock = null;
    let indicatorEl = null;

    function setIndicator(state) {
        if (!indicatorEl) return;
        indicatorEl.dataset.state = state;
    }

    async function requestWakeLock() {
        if (!('wakeLock' in navigator) || !navigator.wakeLock) {
            setIndicator('unsupported');
            return false;
        }

        try {
            wakeLock = await navigator.wakeLock.request('screen');
            setIndicator('active');

            wakeLock.addEventListener('release', () => {
                wakeLock = null;
                setIndicator('idle');
            });

            return true;
        } catch (e) {
            wakeLock = null;
            setIndicator('idle');
            return false;
        }
    }

    async function enable() {
        return requestWakeLock();
    }

    function init({ indicatorId } = {}) {
        indicatorEl = indicatorId ? document.getElementById(indicatorId) : null;
        setIndicator('idle');

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && wakeLock === null) {
                requestWakeLock();
            }
        });

        window.addEventListener('focus', () => {
            if (wakeLock === null) {
                requestWakeLock();
            }
        });
    }

    window.keepAwake = { init, enable };
})();

