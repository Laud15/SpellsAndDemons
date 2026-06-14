<script lang="ts">
  import { resetPassword } from '$lib/firebase/auth';
  import '$lib/styles/login.css';

  let email = $state('');
  let message = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleReset() {
    error = '';
    message = '';
    if (!email) { error = 'Enter your email'; return; }
    loading = true;
    try {
      await resetPassword(email);
      message = 'If an account exists for this email, a reset link has been sent.';
    } catch (e: any) {
      
      if (e.code === 'auth/invalid-email') {
        error = 'invalid email';
      } else {
        message = 'If an account exists for this email, a reset link has been sent.';
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="page-wrapper">
  <div class="auth-container">

    <h1 class="game-title">SPELLS AND DEMONS</h1>
    <h2 class="page-subtitle">Reset Password</h2>

    <p class="page-subtitle" style="font-size: 0.9em;">
      Enter your email and we'll send you a reset link.
    </p>

    <div class="form-group">
      <input type="email" placeholder="Email" bind:value={email} />
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}
    {#if message}
      <p class="success">{message}</p>
    {/if}

    <button onclick={handleReset} disabled={loading || !email}>
      {loading ? 'Sending...' : 'Send reset link'}
    </button>

    <a href="/login">Back to login</a>
  </div>
</div>