// RHS Admin: ask before risky actions. Any form or button with data-confirm="question" asks first.
document.addEventListener('submit', function (e) {
  var q = e.target.getAttribute('data-confirm') || (e.submitter && e.submitter.getAttribute('data-confirm'));
  if (q && !window.confirm(q)) e.preventDefault();
});

// Show a block only when a choice is made: <div data-show-when="audience=selected">
function rhsToggleShowWhen() {
  document.querySelectorAll('[data-show-when]').forEach(function (el) {
    var p = el.getAttribute('data-show-when').split('='), on = document.querySelector('[name="' + p[0] + '"]:checked');
    el.classList.toggle('is-hidden', !(on && on.value === p[1]));
  });
}
document.addEventListener('change', rhsToggleShowWhen);
document.addEventListener('DOMContentLoaded', rhsToggleShowWhen);

// Print / save as PDF: <button data-print>
document.addEventListener('click', function (e) {
  if (e.target.closest('[data-print]')) { e.preventDefault(); window.print(); }
});
// Reports: typing a date switches the period to "Choose dates"
document.addEventListener('change', function (e) {
  if ((e.target.id === 'from' || e.target.id === 'to') && document.getElementById('preset')) document.getElementById('preset').value = 'custom';
});
