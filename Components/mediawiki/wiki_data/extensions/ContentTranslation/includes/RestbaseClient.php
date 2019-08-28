<?php
/**
 * Restbase Client
 *
 * @copyright See AUTHORS.txt
 * @license GPL-2.0-or-later
 */

namespace ContentTranslation;

class RestbaseClient {

	/**
	 * @var \VirtualRESTServiceClient
	 */
	protected $serviceClient;

	/**
	 * The Config object from the request context.
	 * @var \Config
	 */
	protected $config;

	public function __construct( $config ) {
		$this->config = $config;
		$this->serviceClient = new \VirtualRESTServiceClient( new \MultiHttpClient( [] ) );
		// Mounted at /restbase/ because it is a service speaking the
		// RESTBase v1 API -- but the service responding to these API
		// requests could be either Parsoid or RESTBase.
		$this->serviceClient->mount( '/restbase/', $this->getVRSObject() );
	}

	/**
	 * Creates the virtual REST service object to be used in CX's API calls. The
	 * method determines whether to instantiate a ParsoidVirtualRESTService or a
	 * RestbaseVirtualRESTService object based on configuration directives:
	 * if $wgVirtualRestConfig['modules']['restbase'] is defined, use RESTBase,
	 * elseif $wgVirtualRestConfig['modules']['parsoid'] is defined, use Parsoid,
	 * else RESTBase is used.
	 *
	 * @return \VirtualRESTService the VirtualRESTService object to use
	 */
	private function getVRSObject() {
		// the params array to create the service object with
		$params = [];
		// the VRS class to use, defaults to RESTBase
		$class = 'RestbaseVirtualRESTService';
		// the global virtual rest service config object, if any
		$vrs = $this->config->get( 'VirtualRestConfig' );
		if ( isset( $vrs['modules'] ) && isset( $vrs['modules']['restbase'] ) ) {
			// if restbase is available, use it
			$params = $vrs['modules']['restbase'];
			$params['parsoidCompat'] = false; // backward compatibility
		} elseif ( isset( $vrs['modules'] ) && isset( $vrs['modules']['parsoid'] ) ) {
			// there's a global parsoid config, use it next
			$params = $vrs['modules']['parsoid'];
			$params['restbaseCompat'] = true;
			$class = 'ParsoidVirtualRESTService';
		} else {
			// no global modules defined, fall back to old defaults
			$params = $this->config->get( 'ContentTranslationRESTBase' );
			$params['parsoidCompat'] = false;
		}
		// merge the global and service-specific params
		if ( isset( $vrs['global'] ) ) {
			$params = array_merge( $vrs['global'], $params );
		}
		// create the VRS object and return it
		return new $class( $params );
	}

	// Make a RESTBase v1 API request (which could be to either Parsoid or
	// RESTBase; the VRS makes these appear identical).
	private function requestRestbase( $method, $path, $params, $reqheaders = [] ) {
		global $wgVersion;

		$request = [
			'method' => $method,
			'url' => '/restbase/local/v1/' . $path
		];
		if ( $method === 'GET' ) {
			$request['query'] = $params;
		} else {
			$request['body'] = $params;
		}
		// See https://www.mediawiki.org/wiki/Specs/HTML/1.2.1
		$reqheaders['Accept'] =
			'text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/1.2.1"';
		$reqheaders['User-Agent'] = 'ContentTranslation-MediaWiki/' . $wgVersion;
		$request['headers'] = $reqheaders;
		$response = $this->serviceClient->run( $request );
		if ( $response['code'] === 200 && $response['error'] === '' ) {
			return $response['body'];
		} elseif ( $response['error'] !== '' ) {
			throw new \MWException( "docserver-http-error: {$response['error']}" );
		} else { // error null, code not 200
			throw new \MWException( "docserver-http: HTTP {$response['code']}: {$response['body']}" );
		}
	}

	/**
	 * Converts html to wikitext
	 *
	 * @param \Title $title
	 * @param string $html
	 * @return string wikitext
	 */
	public function convertHtmlToWikitext( \Title $title, $html ) {
		$wikitext = $this->requestRestbase(
			'POST',
			'transform/html/to/wikitext/' . urlencode( $title->getPrefixedDBkey() ),
			[
				'html' => $html,
				'scrub_wikitext' => 1,
			]
		);
		if ( $wikitext === false ) {
			$vrsInfo = $this->serviceClient->getMountAndService( '/restbase/' );
			$name = $vrsInfo[1] ? $vrsInfo[1]->getName() : 'unknown VRS service';
			throw new \MWException( 'Error contacting ' . $name );
		}
		return $wikitext;
	}

	/**
	 * Converts wikitext to html
	 *
	 * @param \Title $title
	 * @param string $wikitext
	 * @return string html
	 */
	public function convertWikitextToHtml( \Title $title, $wikitext ) {
		$html = $this->requestRestbase(
			'POST',
			'transform/wikitext/to/html/' . urlencode( $title->getPrefixedDBkey() ),
			[
				'wikitext' => $wikitext,
				'body_only' => 1,
			]
		);
		if ( $html === false ) {
			$vrsInfo = $this->serviceClient->getMountAndService( '/restbase/' );
			$name = $vrsInfo[1] ? $vrsInfo[1]->getName() : 'unknown VRS service';
			throw new \MWException( 'Error contacting ' . $name );
		}
		return $html;
	}
}
