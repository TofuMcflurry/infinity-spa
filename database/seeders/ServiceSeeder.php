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
                'name'             => 'Swedish Relaxation',
                'name_ar'          => 'مساج سويدي',
                'description'      => 'A gentle full-body massage promoting relaxation.',
                'duration_minutes' => 60,
                'price'            => 473.00,
                'rating'           => 4.9,
                'is_active'        => true,
            ],
            [
                'name'             => 'Deep Tissue',
                'name_ar'          => 'مساج عميق',
                'description'      => 'Targets deep muscle layers for tension relief.',
                'duration_minutes' => 90,
                'price'            => 683.00,
                'rating'           => 4.9,
                'is_active'        => true,
            ],
            [
                'name'             => 'Royal Hammam',
                'name_ar'          => 'حمام ملكي',
                'description'      => 'Traditional hammam experience with full scrub.',
                'duration_minutes' => 120,
                'price'            => 893.00,
                'rating'           => 4.8,
                'is_active'        => true,
            ],
            [
                'name'             => 'Hot Stone',
                'name_ar'          => 'مساج الحجارة الساخنة',
                'description'      => 'Heated stones melt away tension and stress.',
                'duration_minutes' => 75,
                'price'            => 609.00,
                'rating'           => 4.9,
                'is_active'        => true,
            ],
            [
                'name'             => 'Anti-Aging Facial',
                'name_ar'          => 'علاج تجميلي مضاد للشيخوخة',
                'description'      => 'Rejuvenating facial treatment for youthful skin.',
                'duration_minutes' => 75,
                'price'            => 756.00,
                'rating'           => 4.8,
                'is_active'        => true,
            ],
        ];

        foreach ($services as $service) {
            Service::create($service);
        }

        $this->command->info('✅ Services seeded successfully!');
    }
}