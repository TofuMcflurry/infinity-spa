<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\Therapist;
use App\Models\TherapistZone;
use Illuminate\Support\Facades\Hash;

class TherapistSeeder extends Seeder
{
    public function run(): void
    {
        $therapists = [
            [
                'user' => [
                    'name'     => 'Maria Santos',
                    'email'    => 'maria@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai Marina',
                    'bio'              => 'Specializes in Deep Tissue and Sports massage.',
                    'experience_years' => 8,
                    'rating'           => 4.9,
                    'gender'           => 'female',
                    'specialty'        => 'Deep Tissue & Sports',
                    'is_active'        => true,
                ],
                'zones' => [
                    ['zone_name' => 'Palm Jumeirah', 'travel_minutes' => 20],
                    ['zone_name' => 'DIFC',          'travel_minutes' => 30],
                    ['zone_name' => 'Burj Al Arab',  'travel_minutes' => 25],
                ],
            ],
            [
                'user' => [
                    'name'     => 'Layla Khatib',
                    'email'    => 'layla@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Downtown Dubai',
                    'bio'              => 'Expert in Aromatherapy and Swedish massage.',
                    'experience_years' => 6,
                    'rating'           => 4.9,
                    'gender'           => 'female',
                    'specialty'        => 'Aromatherapy & Swedish',
                    'is_active'        => true,
                ],
                'zones' => [
                    ['zone_name' => 'Palm Jumeirah', 'travel_minutes' => 30],
                    ['zone_name' => 'DIFC',          'travel_minutes' => 15],
                    ['zone_name' => 'Burj Al Arab',  'travel_minutes' => 20],
                ],
            ],
            [
                'user' => [
                    'name'     => 'Amina Rahman',
                    'email'    => 'amina@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Jumeirah',
                    'bio'              => 'Specializes in Hot Stone and Reflexology.',
                    'experience_years' => 10,
                    'rating'           => 4.9,
                    'gender'           => 'female',
                    'specialty'        => 'Hot Stone & Reflexology',
                    'is_active'        => true,
                ],
                'zones' => [
                    ['zone_name' => 'Palm Jumeirah', 'travel_minutes' => 15],
                    ['zone_name' => 'DIFC',          'travel_minutes' => 25],
                    ['zone_name' => 'Burj Al Arab',  'travel_minutes' => 10],
                ],
            ],
            [
                'user' => [
                    'name'     => 'Sofia Chen',
                    'email'    => 'sofia@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Business Bay',
                    'bio'              => 'Expert in Facial and Anti-Aging treatments.',
                    'experience_years' => 7,
                    'rating'           => 4.9,
                    'gender'           => 'female',
                    'specialty'        => 'Facial & Anti-Aging',
                    'is_active'        => true,
                ],
                'zones' => [
                    ['zone_name' => 'Palm Jumeirah', 'travel_minutes' => 25],
                    ['zone_name' => 'DIFC',          'travel_minutes' => 10],
                    ['zone_name' => 'Burj Al Arab',  'travel_minutes' => 20],
                ],
            ],
        ];

        foreach ($therapists as $data) {
            // Create user account
            $user = User::create($data['user']);

            // Create therapist profile
            $therapist = Therapist::create(array_merge(
                $data['profile'],
                ['user_id' => $user->id]
            ));

            // Create travel zones
            foreach ($data['zones'] as $zone) {
                TherapistZone::create(array_merge(
                    $zone,
                    ['therapist_id' => $therapist->id]
                ));
            }
        }

        $this->command->info('✅ Therapists seeded successfully!');
    }
}