import adapter from '@sveltejs/adapter-node';

const config = {
  compilerOptions: {
    runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
  },
  kit: {
    adapter: adapter(),
    serviceWorker: {
      register: false
    }
  }
};

export default config;