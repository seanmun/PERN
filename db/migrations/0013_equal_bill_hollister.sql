CREATE TABLE "course_tee_yardages" (
	"course_tee_id" uuid NOT NULL,
	"hole_number" integer NOT NULL,
	"yardage" integer NOT NULL,
	CONSTRAINT "course_tee_yardages_course_tee_id_hole_number_pk" PRIMARY KEY("course_tee_id","hole_number")
);
--> statement-breakpoint
CREATE TABLE "course_tees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"rating" numeric(4, 1),
	"slope" integer,
	"total_yardage" integer,
	"display_order" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "course_tees_course_name_unique" UNIQUE("course_id","name")
);
--> statement-breakpoint
ALTER TABLE "course_tee_yardages" ADD CONSTRAINT "course_tee_yardages_course_tee_id_course_tees_id_fk" FOREIGN KEY ("course_tee_id") REFERENCES "public"."course_tees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_tees" ADD CONSTRAINT "course_tees_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;