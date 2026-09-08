const Auth = {
    async init() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
        }
    },

    async login(email, password) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });
        if (error) {
            throw error;
        }
        return data;
    },

    async logout() {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            throw error;
        }
        window.location.href = 'login.html';
    },

    async getSession() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session;
    },

    async getUser() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    }
};
