<?php
require __DIR__ . '/app/bootstrap.php';
require_post_csrf();
if (current_admin()) audit('logout', null, current_admin()['email']);
logout_session();
fresh_session();
flash('success', 'You are logged out.');
redirect('login.php');
