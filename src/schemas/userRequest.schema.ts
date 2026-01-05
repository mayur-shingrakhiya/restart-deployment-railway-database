export type userRequest = {
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  password: string;
  country: string;
  state: string;
  city: string;
  pincode: string;
};


// =====================================================
// Zod Validation Schema
// =====================================================
import { z } from "zod";

export const userRequestSchema = z.object({
  firstName: z
    .string()
    .min(2, "First name must be at least 2 characters")
    .max(50, "First name must be less than 50 characters"),

  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must be less than 50 characters"),

  email: z
    .string()
    .email("Invalid email format")
    .toLowerCase(),

  countryCode: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid country code format (E.164)"),

  phoneNumber: z
    .string()
    .regex(/^\d{7,15}$/, "Invalid phone number format"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),

  country: z
    .string()
    .min(2, "Country is required")
    .max(100, "Country name too long"),

  state: z
    .string()
    .min(2, "State is required")
    .max(100, "State name too long"),

  city: z
    .string()
    .min(2, "City is required")
    .max(100, "City name too long"),

  pincode: z
    .string()
    .min(3, "Pincode is required")
    .max(20, "Pincode too long"),
});

