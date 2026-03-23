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
        // Real zones with full addresses
        $zones = [
            [
                'zone_name'      => 'JAFZA',
                'full_address'   => 'Jebel Ali Free Zone, Block 14, P.O. Box 4333, Dubai',
                'travel_minutes' => 45,
            ],
            [
                'zone_name'      => 'DAFZ',
                'full_address'   => 'Dubai Airport Freezone, Near Dubai International Airport, P.O. Box 491, Dubai',
                'travel_minutes' => 35,
            ],
            [
                'zone_name'      => 'DMCC / JLT',
                'full_address'   => 'Jumeirah Lakes Towers, Dubai Multi Commodities Centre, Dubai',
                'travel_minutes' => 30,
            ],
            [
                'zone_name'      => 'Dubai South',
                'full_address'   => 'Near Al Maktoum International Airport, P.O. Box 282228, Dubai',
                'travel_minutes' => 50,
            ],
            [
                'zone_name'      => 'Dubai Silicon Oasis',
                'full_address'   => 'Academic City Road, Dubai Silicon Oasis, Dubai',
                'travel_minutes' => 40,
            ],
            [
                'zone_name'      => 'Dubai Internet City',
                'full_address'   => 'Near Sheikh Zayed Road, Dubai Internet City & Media City, Dubai',
                'travel_minutes' => 25,
            ],
            [
                'zone_name'      => 'Dubai Design District',
                'full_address'   => 'Near Business Bay, Dubai Design District (d3), Dubai',
                'travel_minutes' => 20,
            ],
            [
                'zone_name'      => 'DIFC',
                'full_address'   => 'Dubai International Financial Centre, Near Downtown Dubai, P.O. Box 74777, Dubai',
                'travel_minutes' => 20,
            ],
        ];

        // Real therapists
        $therapists = [
            [
                'user' => [
                    'name'     => 'Honey Barga',
                    'email'    => 'honey@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai',
                    'bio'              => 'Specializes in Thai Massage with 5 years of experience.',
                    'experience_years' => 5,
                    'rating'           => 0.00,
                    'gender'           => 'female',
                    'specialty'        => 'Thai Massage',
                    'is_active'        => true,
                    'day_off'          => 'Tuesday',
                    'shift_start'      => '16:00',
                    'shift_end'        => '04:00',
                    'crosses_midnight' => true,
                ],
            ],
            [
                'user' => [
                    'name'     => 'Muskhan',
                    'email'    => 'muskhan@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai',
                    'bio'              => 'Expert in Swedish Massage with 3 years of experience.',
                    'experience_years' => 3,
                    'rating'           => 0.00,
                    'gender'           => 'female',
                    'specialty'        => 'Swedish Massage',
                    'is_active'        => true,
                    'day_off'          => 'Tuesday',
                    'shift_start'      => '16:00',
                    'shift_end'        => '04:00',
                    'crosses_midnight' => true,
                ],
            ],
            [
                'user' => [
                    'name'     => 'Monique',
                    'email'    => 'monique@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai',
                    'bio'              => 'Thai Massage therapist with 1 year of experience.',
                    'experience_years' => 1,
                    'rating'           => 0.00,
                    'gender'           => 'female',
                    'specialty'        => 'Thai Massage',
                    'is_active'        => true,
                    'day_off'          => 'Tuesday',
                    'shift_start'      => '16:00',
                    'shift_end'        => '04:00',
                    'crosses_midnight' => true,
                ],
            ],
            [
                'user' => [
                    'name'     => 'Marithess',
                    'email'    => 'marithess@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai',
                    'bio'              => 'Skilled Thai Massage therapist with 3 years of experience.',
                    'experience_years' => 3,
                    'rating'           => 0.00,
                    'gender'           => 'female',
                    'specialty'        => 'Thai Massage',
                    'is_active'        => true,
                    'day_off'          => 'Tuesday',
                    'shift_start'      => '16:00',
                    'shift_end'        => '04:00',
                    'crosses_midnight' => true,
                ],
            ],
            [
                'user' => [
                    'name'     => 'Lois',
                    'email'    => 'lois@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai',
                    'bio'              => 'Swedish Massage therapist with 1 year of experience.',
                    'experience_years' => 1,
                    'rating'           => 0.00,
                    'gender'           => 'female',
                    'specialty'        => 'Swedish Massage',
                    'is_active'        => true,
                    'day_off'          => 'Tuesday',
                    'shift_start'      => '16:00',
                    'shift_end'        => '04:00',
                    'crosses_midnight' => true,
                ],
            ],
            [
                'user' => [
                    'name'     => 'JV',
                    'email'    => 'jv@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai',
                    'bio'              => 'Thai Massage therapist.',
                    'experience_years' => 0,
                    'rating'           => 0.00,
                    'gender'           => 'female',
                    'specialty'        => 'Thai Massage',
                    'is_active'        => true,
                    'day_off'          => 'Tuesday',
                    'shift_start'      => '16:00',
                    'shift_end'        => '04:00',
                    'crosses_midnight' => true,
                ],
            ],
            [
                'user' => [
                    'name'     => 'Rochelle',
                    'email'    => 'rochelle@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai',
                    'bio'              => 'Thai Massage therapist.',
                    'experience_years' => 0,
                    'rating'           => 0.00,
                    'gender'           => 'female',
                    'specialty'        => 'Thai Massage',
                    'is_active'        => true,
                    'day_off'          => 'Tuesday',
                    'shift_start'      => '16:00',
                    'shift_end'        => '04:00',
                    'crosses_midnight' => true,
                ],
            ],
            [
                'user' => [
                    'name'     => 'Grace',
                    'email'    => 'grace@infinityspa.com',
                    'password' => Hash::make('password'),
                    'role'     => 'therapist',
                ],
                'profile' => [
                    'base_location'    => 'Dubai',
                    'bio'              => 'Experienced Thai Massage therapist with 5 years of experience.',
                    'experience_years' => 5,
                    'rating'           => 0.00,
                    'gender'           => 'female',
                    'specialty'        => 'Thai Massage',
                    'is_active'        => true,
                    'day_off'          => 'Tuesday',
                    'shift_start'      => '16:00',
                    'shift_end'        => '04:00',
                    'crosses_midnight' => true,
                ],
            ],
        ];

        foreach ($therapists as $data) {
            // Create user
            $user = User::create($data['user']);

            // Create therapist profile
            $therapist = Therapist::create(array_merge(
                $data['profile'],
                ['user_id' => $user->id]
            ));

            // Assign all zones to every therapist
            foreach ($zones as $zone) {
                TherapistZone::create(array_merge(
                    $zone,
                    ['therapist_id' => $therapist->id]
                ));
            }
        }

        $this->command->info('✅ Real therapists seeded with all zones!');
    }
}