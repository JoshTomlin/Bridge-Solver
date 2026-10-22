// A normal tap bids. A held or cancelled pointer gesture consumes its click,
// including the compatibility click mobile browsers send after pointerup.
export function attachBidPreview(root, preview, { getCall, label, commit }) {
  let gesture = null;
  let blockClick = false;
  let described = null;
  const buttonFor = target => target?.closest?.('[data-bid]');
  const hide = () => {
    preview.hidden = true;
    described?.removeAttribute('aria-describedby');
    described = null;
  };
  const show = button => {
    if (!button || button.disabled) return;
    const call = getCall(button.dataset.bid);
    if (!call) return;
    hide();
    preview.querySelector('#preview-bid').textContent = label(call.bid);
    preview.querySelector('#preview-tag').textContent = call.discussed ? '' : 'Undiscussed';
    preview.querySelector('#preview-meaning').textContent = label(call.label);
    button.setAttribute('aria-describedby', preview.id);
    described = button;
    preview.hidden = false;
  };
  const cancelTimer = () => { if (gesture) clearTimeout(gesture.timer); };
  const reset = () => {
    if (gesture) blockClick = true;
    cancelTimer();
    gesture = null;
    hide();
  };
  root.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse') return;
    const button = buttonFor(event.target);
    if (button !== buttonFor(event.relatedTarget)) show(button);
  });
  root.addEventListener('pointerout', event => {
    if (event.pointerType === 'mouse' && buttonFor(event.target) !== buttonFor(event.relatedTarget)) hide();
  });
  root.addEventListener('focusin', event => {
    const button = buttonFor(event.target);
    if (button?.matches(':focus-visible')) show(button);
  });
  root.addEventListener('focusout', hide);
  root.ownerDocument.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  root.addEventListener('contextmenu', event => { if (buttonFor(event.target)) event.preventDefault(); });
  root.addEventListener('pointerdown', event => {
    const button = buttonFor(event.target);
    if (!button || button.disabled || event.button !== 0) return;
    reset();
    blockClick = false;
    if (event.pointerType === 'mouse') return;
    try { button.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events have no active pointer. */ }
    gesture = { pointerId: event.pointerId, button, x: event.clientX, y: event.clientY, held: false, cancelled: false };
    gesture.timer = setTimeout(() => {
      if (!gesture || !button.isConnected) return;
      gesture.held = true;
      show(button);
    }, 420);
  });
  root.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) {
      gesture.cancelled = true;
      cancelTimer();
      hide();
    }
  });
  const finish = event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const bounds = gesture.button.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    blockClick = gesture.held || gesture.cancelled || outside || event.type === 'pointercancel';
    cancelTimer();
    gesture = null;
    hide();
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  root.addEventListener('click', event => {
    const button = buttonFor(event.target);
    if (!button || button.disabled) return;
    if (blockClick && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
      blockClick = false;
      return;
    }
    hide();
    commit(button.dataset.bid);
  });
  return { reset };
}
