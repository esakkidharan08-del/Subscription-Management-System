import { z } from 'zod';

export const emailField = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

// One message per failed rule so the form can show all of them at once.
export const passwordField = z
  .string({ required_error: 'Password is required' })
  .min(9, 'Password must be more than 8 characters')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character');

const nameField = z.string().trim().min(1, 'Name is required').max(100);

export const signupSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is missing'),
  password: passwordField,
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Enter your current password'),
  new_password: passwordField,
});

export const createUserSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  role: z.enum(['admin', 'staff', 'customer']),
});
