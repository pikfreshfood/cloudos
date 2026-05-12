<?php

namespace Tests\Feature;

use Tests\TestCase;

class MarketingPagesTest extends TestCase
{
    public function test_public_marketing_pages_load(): void
    {
        foreach (['/about', '/contact-us', '/faq', '/terms-and-conditions', '/privacy-policy', '/device-call'] as $path) {
            $this->get($path)
                ->assertOk()
                ->assertSee('Cloud OS');
        }
    }
}
