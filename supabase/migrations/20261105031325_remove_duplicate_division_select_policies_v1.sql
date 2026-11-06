-- Remove SELECT policies whose predicates exactly duplicate their ALL policy.
-- The ALL policy continues to enforce the same USING/WITH CHECK expression.
DROP POLICY item_unit_conversions_division_read ON public.item_unit_conversions;
DROP POLICY items_division_read ON public.items;
DROP POLICY menu_recipe_lines_division_read ON public.menu_recipe_lines;
DROP POLICY menus_division_read ON public.menus;
DROP POLICY wip_recipe_lines_division_read ON public.wip_recipe_lines;
DROP POLICY wip_recipes_division_read ON public.wip_recipes;
