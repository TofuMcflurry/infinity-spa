<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Service;

class ServiceSeeder extends Seeder
{
    public function run(): void
    {
        $services = [
            [
                'name'             => 'Couple Massage 60 min',
                'name_ar'          => 'مساج الأزواج ٦٠ دقيقة',
                'group_name'       => 'Couple Massage',
                'group_name_ar'    => 'مساج الأزواج',
                'description'      => 'A relaxing couples massage session for two.',
                'duration_minutes' => 60,
                'price'            => 349.00,
                'rating'           => 0.00,
                'category'         => 'massage',
                'is_active'        => true,
            ],
            [
                'name'             => 'Couple Massage 90 min',
                'name_ar'          => 'مساج الأزواج ٩٠ دقيقة',
                'group_name'       => 'Couple Massage',
                'group_name_ar'    => 'مساج الأزواج',
                'description'      => 'An extended couples massage session for deep relaxation.',
                'duration_minutes' => 90,
                'price'            => 449.00,
                'rating'           => 0.00,
                'category'         => 'massage',
                'is_active'        => true,
            ],
            [
                'name'             => 'Couple Massage 120 min',
                'name_ar'          => 'مساج الأزواج ١٢٠ دقيقة',
                'group_name'       => 'Couple Massage',
                'group_name_ar'    => 'مساج الأزواج',
                'description'      => 'A premium full couples massage experience.',
                'duration_minutes' => 120,
                'price'            => 449.00,
                'rating'           => 0.00,
                'category'         => 'massage',
                'is_active'        => true,
            ],
            [
                'name'             => 'Swedish Massage 60 min',
                'name_ar'          => 'مساج سويدي ٦٠ دقيقة',
                'group_name'       => 'Swedish Massage',
                'group_name_ar'    => 'مساج سويدي',
                'description'      => 'A classic Swedish massage with hot oil therapy.',
                'duration_minutes' => 60,
                'price'            => 349.00,
                'rating'           => 0.00,
                'category'         => 'massage',
                'is_active'        => true,
            ],
            [
                'name'             => 'Swedish Massage 90 min',
                'name_ar'          => 'مساج سويدي ٩٠ دقيقة',
                'group_name'       => 'Swedish Massage',
                'group_name_ar'    => 'مساج سويدي',
                'description'      => 'An extended Swedish massage with hot oil therapy.',
                'duration_minutes' => 90,
                'price'            => 449.00,
                'rating'           => 0.00,
                'category'         => 'massage',
                'is_active'        => true,
            ],
            [
                'name'             => 'Full Body Scrub',
                'name_ar'          => 'تقشير الجسم الكامل',
                'group_name'       => 'Full Body Scrub',
                'group_name_ar'    => 'تقشير الجسم الكامل',
                'description'      => 'A revitalizing full body scrub treatment.',
                'duration_minutes' => 60,
                'price'            => 149.00,
                'rating'           => 0.00,
                'category'         => 'homeRituals',
                'is_active'        => true,
            ],
        ];

        foreach ($services as $service) {
            Service::create($service);
        }

        $this->command->info('✅ Real services seeded!');
    }
}