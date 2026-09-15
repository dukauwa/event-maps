import type { Metadata } from "next";
import { listCategories } from "@/lib/services/categories";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { loadEvent } from "../../../_lib";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await loadEvent(id);
  return <CategoriesManager event={{ id: event.id, name: event.name, exhibitors: event.settings.terms.exhibitors }} categories={listCategories(event.id)} />;
}
