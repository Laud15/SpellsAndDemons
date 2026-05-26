<!-- src/routes/(public)/login/+page.svelte -->
<script lang="ts">
  import { login } from '$lib/firebase/auth';
  import { goto } from '$app/navigation';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin() {
    error = '';
    loading = true;
    try {
      await login(email, password);
      goto('/home');
    } catch (e: any) {
      error = mapAuthError(e.code);
    } finally {
      loading = false;
    }
  }

  function mapAuthError(code: string): string {
    switch (code) {
      case 'auth/invalid-credential': return 'email or password are wrong';
      case 'auth/invalid-email': return 'invalid email';
      case 'auth/too-many-requests': return 'too many request, try later';
      default: return 'Error during login: ' + code;
    }
  }
</script>

<h1>Login</h1>

<input type="email" placeholder="Email" bind:value={email} />
<input /*type="password"*/ placeholder="Password" bind:value={password} />

{#if error}
  <p class="error">{error}</p>
{/if}

<button onclick={handleLogin} disabled={loading}>
  {loading ? 'Login...' : 'Login'}
</button>

<a href="/register">Don't have an account? Register!</a>