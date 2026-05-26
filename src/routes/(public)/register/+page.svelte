<script lang="ts">
    import { register } from '$lib/firebase/auth';
    import { goto } from '$app/navigation';
	
    let email = $state('');
    let password = $state('');
    let username = $state('');
    let error = $state('');
    let loading = $state(false);

    async function handleRegister() {
        error = '';
        const regex = /^[a-zA-Z0-9_]{3,15}$/;

        if(!regex.test(username)){
            error = 'invalid characters in the username'
            return;
        }

        loading = true;

        try{
            await register(email, password, username);
            goto('/home');
        }catch (e: any){
            error = mapAuthError(e.code)
        }finally{
            loading = false;
        }

    }

    function mapAuthError(code: string): string {
        switch (code) {
            case 'auth/email-already-in-use': return 'Email already in use';
            case 'auth/username-already-in-use': return 'Username already in use';
            case 'auth/weak-password': return 'Password too short (min 6 char.)';
            case 'auth/invalid-email': return 'Invalid email';
            default: return 'error during registration: ' + code;
        }
    }

</script>

<h1>Register</h1>

<input type="text" placeholder="Username" bind:value={username}/>
<input type="email" placeholder="Email" bind:value={email}/>
<input /*type="password"*/ placeholder="Password" bind:value={password}/>

{#if error}
  <p style="color:red;" class="error">{error}</p>
{/if}

<button onclick={handleRegister} disabled={loading}>
  {loading ? 'Loading...' : 'Register'}
</button>

<a href="/login">Do you have an account? Login!</a>