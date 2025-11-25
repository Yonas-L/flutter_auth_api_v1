-- Add 'Electric' to vehicle_types category check constraint
ALTER TABLE vehicle_types DROP CONSTRAINT IF EXISTS vehicle_types_category_check;

ALTER TABLE vehicle_types ADD CONSTRAINT vehicle_types_category_check 
CHECK (category IN ('Economy', 'Comfort', 'Premium', 'SUV', 'Van', 'Electric'));
