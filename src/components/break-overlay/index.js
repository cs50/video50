import { subscribe, publish } from 'minpubsub';

export default () => {
  let timer;
  const $container = document.createElement('break-overlay');
  $container.setAttribute('hidden', true);

  const hideOverlay = () => {
    window.ga('send', 'event', 'break', 'continued');
    $container.setAttribute('hidden', true);
    publish('video:play');
  };

  const stopTimer = () => {
    window.ga('send', 'event', 'break', 'taken');
    clearTimeout(timer);
  };

  const disableBreaks = () => {
    window.ga('send', 'event', 'break', 'disabled');
    document.querySelector('break-toggle input').checked = false;
    hideOverlay();
  };

  const showOverlay = next => {
    let counter = 10;
    $container.innerHTML = `<section>
      <h3>Coming up Next</h3>
      <h1>${next}</h1>
      <div>
        <button class='cancel'>Pause</button>
        <button class='continue'>Continue (<span>${counter}</span>)</button>
      </div>
      <button class='continue-no-breaks'>Continue without breaks</button>
    </section>`;

    const $counter = $container.querySelector('span');
    const $continue = $container.querySelector('.continue');
    const $cancel = $container.querySelector('.cancel');
    const $continueNoBreaks = $container.querySelector('.continue-no-breaks');

    $continue.addEventListener('click', hideOverlay);
    $cancel.addEventListener('click', stopTimer);
    $continueNoBreaks.addEventListener('click', disableBreaks);

    $container.removeAttribute('hidden');
    timer = setInterval(() => {
      $counter.innerHTML = counter--;
      if (counter === -1) {
        clearTimeout(timer);
        hideOverlay();
      }
    }, 1000);
    publish('video:pause');
  };

  subscribe('video:timeout', showOverlay);
  subscribe('video:hideTimeout', hideOverlay);
  return $container;
};