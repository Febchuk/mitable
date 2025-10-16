/**
 * Mock Supabase client for tests
 */

export const supabaseAdmin = {
  auth: {
    getUser: jest.fn(),
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
  },
  from: jest.fn(() => ({
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
};

export const supabase = {
  auth: {
    getUser: jest.fn(),
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
  },
  from: jest.fn(() => ({
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
};
